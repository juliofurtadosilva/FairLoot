using System.Net.Http.Headers;
using System.Text.Json;
using FairLoot.Data;
using FairLoot.Domain;
using System.Text.RegularExpressions;
using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;

namespace FairLoot.Services
{
    public class WowAuditService
    {
        private readonly HttpClient _http;
        private readonly ILogger<WowAuditService> _logger;
        private string? _lastRawWishlistJson;
        private static readonly ConcurrentDictionary<int, (string? Url, DateTime CachedAt)> _wowheadIconCache = new();
            private static readonly ConcurrentDictionary<string, (DateTime Expiry, List<DTOs.CharacterWishlistSummary> Data)> _wishlistSummaryCache = new();
            private static readonly TimeSpan _wishlistCacheTtl = TimeSpan.FromMinutes(30);
            private static readonly TimeSpan _iconNullCacheTtl = TimeSpan.FromHours(2);
            private static readonly SemaphoreSlim _iconSemaphore = new(5, 5);
        private readonly BlizzardService? _blizzard;

        public WowAuditService(HttpClient http, ILogger<WowAuditService> logger, BlizzardService? blizzard = null)
        {
            _http = http;
            _logger = logger;
            _blizzard = blizzard;
        }

        private static List<string> BuildCandidateUrls(string apiKeyOrUrl, params string[] endpoints)
        {
            var candidates = new List<string>();
            if (apiKeyOrUrl.StartsWith("http", StringComparison.OrdinalIgnoreCase))
            {
                var baseUrl = apiKeyOrUrl.TrimEnd('/');
                foreach (var ep in endpoints)
                    candidates.Add($"{baseUrl}/{ep}");
            }
            else
            {
                foreach (var ep in endpoints)
                    candidates.Add($"https://wowaudit.com/{ep}?api_key={Uri.EscapeDataString(apiKeyOrUrl)}");
            }
            return candidates;
        }

        // Try to fetch the icon URL for given item id. Cached in-memory.
        public async Task<string?> GetWowheadIconAsync(int? itemId)
        {
            if (itemId == null) return null;
            var id = itemId.Value;
            if (_wowheadIconCache.TryGetValue(id, out var cached))
            {
                // return cached value if it's a successful result, or if the null TTL hasn't expired
                if (cached.Url != null) return cached.Url;
                if (DateTime.UtcNow - cached.CachedAt < _iconNullCacheTtl) return null;
                // null cache expired — retry below
            }

            // prefer Blizzard API when available
            try
            {
                if (_blizzard != null)
                {
                    var media = await _blizzard.GetItemIconAsync(id);
                    if (!string.IsNullOrEmpty(media))
                    {
                        // if Blizzard returns full url, use it; otherwise if it returns icon token, map to render url
                        if (media.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                        {
                            _wowheadIconCache[id] = (media, DateTime.UtcNow);
                            return media;
                        }
                        else
                        {
                            var render = $"https://render.worldofwarcraft.com/us/icons/36/{media}.jpg";
                            _wowheadIconCache[id] = (render, DateTime.UtcNow);
                            return render;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "blizzard icon fetch failed for {ItemId}", itemId);
            }

            // throttle outbound requests to avoid flooding Wowhead
            await _iconSemaphore.WaitAsync();
            try
            {
                // re-check cache after acquiring semaphore (another thread may have populated it)
                if (_wowheadIconCache.TryGetValue(id, out cached))
                {
                    if (cached.Url != null) return cached.Url;
                    if (DateTime.UtcNow - cached.CachedAt < _iconNullCacheTtl) return null;
                }

                // use Wowhead tooltip JSON endpoint — lightweight and reliable
                var tooltipUrl = $"https://nether.wowhead.com/tooltip/item/{id}?dataEnv=1&locale=0";
                using var tipReq = new HttpRequestMessage(HttpMethod.Get, tooltipUrl);
                tipReq.Headers.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
                tipReq.Headers.TryAddWithoutValidation("Accept", "application/json");
                var tipRes = await _http.SendAsync(tipReq);
                if (tipRes.IsSuccessStatusCode)
                {
                    var tipText = await tipRes.Content.ReadAsStringAsync();
                    var tipMatch = Regex.Match(tipText, @"""icon""\s*:\s*""([a-z0-9_]+)""", RegexOptions.IgnoreCase);
                    if (tipMatch.Success)
                    {
                        var tipIcon = tipMatch.Groups[1].Value;
                        var render = $"https://wow.zamimg.com/images/wow/icons/medium/{tipIcon}.jpg";
                        _wowheadIconCache[id] = (render, DateTime.UtcNow);
                        return render;
                    }
                }

                _wowheadIconCache[id] = (null, DateTime.UtcNow);
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "failed to fetch icon for {ItemId}", itemId);
                _wowheadIconCache[id] = (null, DateTime.UtcNow);
                return null;
            }
            finally
            {
                _iconSemaphore.Release();
            }
        }

        // Return the raw wishlist JSON string from the first successful candidate URL (or null)
        public async Task<string?> GetRawWishlistJson(string apiKeyOrUrl)
        {
            if (string.IsNullOrEmpty(apiKeyOrUrl)) return null;

            var candidates = BuildCandidateUrls(apiKeyOrUrl, "v1/wishlist", "v1/wishlists", "api/v1/wishlist");

            foreach (var url in candidates)
            {
                try
                {
                    var res = await _http.GetAsync(url);
                    if (!res.IsSuccessStatusCode) continue;
                    var content = await res.Content.ReadAsStringAsync();
                    // sometimes the candidate URL returns HTML page instead of JSON (site homepage).
                    // detect and skip HTML responses.
                    if (!string.IsNullOrWhiteSpace(content) && content.TrimStart().StartsWith("<"))
                    {
                        _logger.LogDebug("Skipping HTML response from {Url}", url);
                        continue;
                    }
                    return content;
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "candidate raw wishlist url failed: {Url}", url);
                }
            }

            return null;
        }

        // Get characters for a guild using a stored wowaudit credential.
        // The stored value may be either a raw API key or a base API URL created by wowaudit.
        public async Task<List<DTOs.CharacterInfo>> GetGuildCharactersAsync(string apiKeyOrUrl)
        {
            if (string.IsNullOrEmpty(apiKeyOrUrl)) return new List<DTOs.CharacterInfo>();

            var candidates = BuildCandidateUrls(apiKeyOrUrl, "v1/characters", "api/v1/characters", "api/v2/guild/characters");

            foreach (var url in candidates)
            {
                try
                {
                    var res = await _http.GetAsync(url);
                    if (!res.IsSuccessStatusCode) continue;

                    var json = await res.Content.ReadAsStringAsync();
                    // keep a copy of raw json in case callers want it
                    // (we don't return it here, but we may provide a method to get raw)
                    using var doc = JsonDocument.Parse(json);

                    // common shapes: { "characters": [ ... ] } or an array directly
                    var list = new List<DTOs.CharacterInfo>();
                    if (doc.RootElement.ValueKind == JsonValueKind.Object && doc.RootElement.TryGetProperty("characters", out var chars))
                    {
                        foreach (var c in chars.EnumerateArray())
                        {
                            if (c.ValueKind == JsonValueKind.Object)
                            {
                                var info = new DTOs.CharacterInfo();
                                info.Name = c.TryGetProperty("name", out var name) ? name.GetString() ?? string.Empty : string.Empty;
                                info.Realm = c.TryGetProperty("realm", out var realm) ? realm.GetString() ?? string.Empty : string.Empty;
                                // try common class properties
                                if (c.TryGetProperty("class", out var cls) && cls.ValueKind == JsonValueKind.String) info.Class = cls.GetString() ?? string.Empty;
                                else if (c.TryGetProperty("class_name", out var cls2) && cls2.ValueKind == JsonValueKind.String) info.Class = cls2.GetString() ?? string.Empty;
                                else if (c.TryGetProperty("player_class", out var cls3) && cls3.ValueKind == JsonValueKind.String) info.Class = cls3.GetString() ?? string.Empty;
                                list.Add(info);
                            }
                            else if (c.ValueKind == JsonValueKind.String)
                                list.Add(new DTOs.CharacterInfo { Name = c.GetString() ?? string.Empty });
                        }
                    }
                    else if (doc.RootElement.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var c in doc.RootElement.EnumerateArray())
                        {
                            if (c.ValueKind == JsonValueKind.Object)
                            {
                                var info = new DTOs.CharacterInfo();
                                info.Name = c.TryGetProperty("name", out var name) ? name.GetString() ?? string.Empty : string.Empty;
                                info.Realm = c.TryGetProperty("realm", out var realm) ? realm.GetString() ?? string.Empty : string.Empty;
                                if (c.TryGetProperty("class", out var cls) && cls.ValueKind == JsonValueKind.String) info.Class = cls.GetString() ?? string.Empty;
                                else if (c.TryGetProperty("class_name", out var cls2) && cls2.ValueKind == JsonValueKind.String) info.Class = cls2.GetString() ?? string.Empty;
                                list.Add(info);
                            }
                            else if (c.ValueKind == JsonValueKind.String)
                                list.Add(new DTOs.CharacterInfo { Name = c.GetString() ?? string.Empty });
                        }
                    }

                    if (list.Count > 0) return list;
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "candidate url failed: {Url}", url);
                    // try next candidate
                }
            }

            _logger.LogWarning("Failed to fetch guild characters from WowAudit using provided credential");
            return new List<DTOs.CharacterInfo>();
        }

        // Fetch wishlist data from WowAudit. Returns mapping character -> list of wishlist items (names)
        public async Task<Dictionary<string, List<string>>> GetGuildWishlistAsync(string apiKeyOrUrl)
        {
            var result = new Dictionary<string, List<string>>();
            if (string.IsNullOrEmpty(apiKeyOrUrl)) return result;

            var candidates = new List<string>();
            if (apiKeyOrUrl.StartsWith("http", StringComparison.OrdinalIgnoreCase))
            {
                var baseUrl = apiKeyOrUrl.TrimEnd('/');
                candidates.Add($"{baseUrl}/v1/wishlist");
                candidates.Add($"{baseUrl}/v1/wishlists");
                candidates.Add($"{baseUrl}/api/v1/wishlist");
            }
            else
            {
                candidates.Add($"https://wowaudit.com/v1/wishlist?api_key={Uri.EscapeDataString(apiKeyOrUrl)}");
                candidates.Add($"https://wowaudit.com/v1/wishlists?api_key={Uri.EscapeDataString(apiKeyOrUrl)}");
                candidates.Add($"https://wowaudit.com/api/v1/wishlist?api_key={Uri.EscapeDataString(apiKeyOrUrl)}");
            }

            foreach (var url in candidates)
            {
                try
                {
                    var res = await _http.GetAsync(url);
                    if (!res.IsSuccessStatusCode) continue;

                    var json = await res.Content.ReadAsStringAsync();
                    // If caller needs raw JSON, we can return it via GetRawWishlistJson
                    using var doc = JsonDocument.Parse(json);

                    // If API returned characters array with nested wishlist, extract items per character
                    if (doc.RootElement.ValueKind == JsonValueKind.Object && doc.RootElement.TryGetProperty("characters", out var charsNode) && charsNode.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var c in charsNode.EnumerateArray())
                        {
                            var charName = c.TryGetProperty("name", out var cn) ? cn.GetString() ?? string.Empty : string.Empty;
                            if (string.IsNullOrEmpty(charName)) continue;
                            var items = new List<string>();
                            if (c.TryGetProperty("instances", out var instances) && instances.ValueKind == JsonValueKind.Array)
                            {
                                foreach (var inst in instances.EnumerateArray())
                                {
                                    if (inst.TryGetProperty("difficulties", out var diffs) && diffs.ValueKind == JsonValueKind.Array)
                                    {
                                        foreach (var d in diffs.EnumerateArray())
                                        {
                                            if (d.TryGetProperty("wishlist", out var wl) && wl.ValueKind == JsonValueKind.Object)
                                            {
                                                if (wl.TryGetProperty("encounters", out var encounters) && encounters.ValueKind == JsonValueKind.Array)
                                                {
                                                    foreach (var e in encounters.EnumerateArray())
                                                    {
                                                        if (e.TryGetProperty("items", out var its) && its.ValueKind == JsonValueKind.Array)
                                                        {
                                                            foreach (var it in its.EnumerateArray())
                                                            {
                                                                if (it.ValueKind == JsonValueKind.String) items.Add(it.GetString() ?? string.Empty);
                                                                else if (it.ValueKind == JsonValueKind.Object && it.TryGetProperty("name", out var iname)) items.Add(iname.GetString() ?? string.Empty);
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            if (!result.ContainsKey(charName)) result[charName] = new List<string>();
                            foreach (var it in items) if (!result[charName].Contains(it)) result[charName].Add(it);
                        }
                        if (result.Count > 0) return result;
                    }

                    // Common shapes: { "wishlist": { "CharacterName": ["Item A", ...], ... } }
                    // or array of { "character": "Name", "items": [ ... ] }
                    if (doc.RootElement.ValueKind == JsonValueKind.Object)
                    {
                        if (doc.RootElement.TryGetProperty("wishlist", out var wlObj) && wlObj.ValueKind == JsonValueKind.Object)
                        {
                            foreach (var prop in wlObj.EnumerateObject())
                            {
                                var list = new List<string>();
                                if (prop.Value.ValueKind == JsonValueKind.Array)
                                {
                                    foreach (var it in prop.Value.EnumerateArray())
                                    {
                                        if (it.ValueKind == JsonValueKind.String) list.Add(it.GetString() ?? string.Empty);
                                        else if (it.ValueKind == JsonValueKind.Object && it.TryGetProperty("name", out var nm)) list.Add(nm.GetString() ?? string.Empty);
                                    }
                                }
                                result[prop.Name] = list;
                            }
                            if (result.Count > 0) return result;
                        }

                        // try array shape
                        if (doc.RootElement.TryGetProperty("wishlists", out var wlArray) && wlArray.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var entry in wlArray.EnumerateArray())
                            {
                                string charName = entry.GetProperty("character").GetString() ?? string.Empty;
                                var list = new List<string>();
                                if (entry.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array)
                                {
                                    foreach (var it in items.EnumerateArray())
                                    {
                                        if (it.ValueKind == JsonValueKind.String) list.Add(it.GetString() ?? string.Empty);
                                        else if (it.ValueKind == JsonValueKind.Object && it.TryGetProperty("name", out var nm)) list.Add(nm.GetString() ?? string.Empty);
                                    }
                                }
                                if (!string.IsNullOrEmpty(charName)) result[charName] = list;
                            }
                            if (result.Count > 0) return result;
                        }
                    }
                    else if (doc.RootElement.ValueKind == JsonValueKind.Array)
                    {
                        // array of entries
                        foreach (var entry in doc.RootElement.EnumerateArray())
                        {
                            if (entry.ValueKind != JsonValueKind.Object) continue;
                            string charName = entry.TryGetProperty("character", out var ch) ? ch.GetString() ?? string.Empty : string.Empty;
                            var list = new List<string>();
                            if (entry.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array)
                            {
                                foreach (var it in items.EnumerateArray())
                                {
                                    if (it.ValueKind == JsonValueKind.String) list.Add(it.GetString() ?? string.Empty);
                                    else if (it.ValueKind == JsonValueKind.Object && it.TryGetProperty("name", out var nm)) list.Add(nm.GetString() ?? string.Empty);
                                }
                            }
                            if (!string.IsNullOrEmpty(charName)) result[charName] = list;
                        }
                        if (result.Count > 0) return result;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "candidate wishlist url failed: {Url}", url);
                }
            }

            _logger.LogWarning("Failed to fetch wishlist from WowAudit using provided credential");
            return result;
        }

        // Return structured summary per character (difficulties, encounters, totals)
        public async Task<List<DTOs.CharacterWishlistSummary>> GetGuildWishlistSummaryAsync(string apiKeyOrUrl)
        {
            var summaries = new List<DTOs.CharacterWishlistSummary>();
            if (string.IsNullOrEmpty(apiKeyOrUrl)) return summaries;

            // check in-memory cache
            if (_wishlistSummaryCache.TryGetValue(apiKeyOrUrl, out var cached) && cached.Expiry > DateTime.UtcNow)
            {
                return cached.Data;
            }

            var candidates = new List<string>();
            if (apiKeyOrUrl.StartsWith("http", StringComparison.OrdinalIgnoreCase))
            {
                var baseUrl = apiKeyOrUrl.TrimEnd('/');
                candidates.Add($"{baseUrl}/v1/wishlists");
                candidates.Add($"{baseUrl}/v1/wishlist");
                candidates.Add($"{baseUrl}/api/v1/wishlists");
            }
            else
            {
                candidates.Add($"https://wowaudit.com/v1/wishlists?api_key={Uri.EscapeDataString(apiKeyOrUrl)}");
                candidates.Add($"https://wowaudit.com/v1/wishlist?api_key={Uri.EscapeDataString(apiKeyOrUrl)}");
                candidates.Add($"https://wowaudit.com/api/v1/wishlists?api_key={Uri.EscapeDataString(apiKeyOrUrl)}");
            }

            foreach (var url in candidates)
            {
                try
                {
                    var res = await _http.GetAsync(url);
                    if (!res.IsSuccessStatusCode) continue;

                    var json = await res.Content.ReadAsStringAsync();
                    // store raw json for potential external use
                    _lastRawWishlistJson = json;
                    using var doc = JsonDocument.Parse(json);

                    // Expecting structure with characters array similar to sample
                    if (doc.RootElement.ValueKind == JsonValueKind.Object && doc.RootElement.TryGetProperty("characters", out var chars) && chars.ValueKind == JsonValueKind.Array)
                    {
                        // collect all items that need icon resolution for parallel fetching
                        var iconTasks = new List<(DTOs.ItemSummary Item, Task<string?> Task)>();

                        foreach (var c in chars.EnumerateArray())
                        {
                            var ch = new DTOs.CharacterWishlistSummary();
                            ch.Name = c.GetProperty("name").GetString() ?? string.Empty;
                            ch.Realm = c.TryGetProperty("realm", out var realm) ? realm.GetString() ?? string.Empty : string.Empty;
                            // try to capture class if present
                            if (c.TryGetProperty("class", out var cl) && cl.ValueKind == JsonValueKind.String) ch.Class = cl.GetString() ?? string.Empty;
                            else if (c.TryGetProperty("class_name", out var cl2) && cl2.ValueKind == JsonValueKind.String) ch.Class = cl2.GetString() ?? string.Empty;

                            if (c.TryGetProperty("instances", out var instances) && instances.ValueKind == JsonValueKind.Array)
                            {
                                foreach (var inst in instances.EnumerateArray())
                                {
                                    var instanceSummary = new DTOs.InstanceSummary();
                                    instanceSummary.Name = inst.TryGetProperty("name", out var iname) ? iname.GetString() ?? string.Empty : string.Empty;
                                    if (inst.TryGetProperty("difficulties", out var diffs) && diffs.ValueKind == JsonValueKind.Array)
                                    {
                                        foreach (var d in diffs.EnumerateArray())
                                        {
                                            var ds = new DTOs.DifficultySummary();
                                            ds.Difficulty = d.GetProperty("difficulty").GetString() ?? string.Empty;
                                            if (d.TryGetProperty("wishlist", out var wl) && wl.ValueKind == JsonValueKind.Object)
                                            {
                                                ds.TotalPercentage = wl.TryGetProperty("total_percentage", out var tp) && tp.ValueKind == JsonValueKind.Number ? tp.GetDouble() : 0;
                                                ds.TotalAbsolute = wl.TryGetProperty("total_absolute", out var ta) && ta.ValueKind == JsonValueKind.Number ? ta.GetInt32() : 0;

                                                if (wl.TryGetProperty("encounters", out var encounters) && encounters.ValueKind == JsonValueKind.Array)
                                                {
                                                    foreach (var e in encounters.EnumerateArray())
                                                    {
                                                        var es = new DTOs.EncounterSummary();
                                                        es.Name = e.TryGetProperty("name", out var en) ? en.GetString() ?? string.Empty : string.Empty;
                                                        es.EncounterPercentage = e.TryGetProperty("encounter_percentage", out var ep) && ep.ValueKind == JsonValueKind.Number ? ep.GetDouble() : 0;
                                                        es.EncounterAbsolute = e.TryGetProperty("encounter_absolute", out var ea) && ea.ValueKind == JsonValueKind.Number ? ea.GetInt32() : 0;
                                                        if (e.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array)
                                                        {
                                                            foreach (var it in items.EnumerateArray())
                                                            {
                                                                var itemSummary = new DTOs.ItemSummary();
                                                                if (it.ValueKind == JsonValueKind.Object)
                                                                {
                                                                    itemSummary.Name = it.TryGetProperty("name", out var iname2) ? iname2.GetString() ?? string.Empty : string.Empty;
                                                                    // try multiple possible id property names returned by different wishlist shapes
                                                                    int? parsedId = null;
                                                                    foreach (var idProp in new[] { "id", "item_id", "itemId", "entry" })
                                                                    {
                                                                        if (parsedId.HasValue) break;
                                                                        if (!it.TryGetProperty(idProp, out var idVal)) continue;
                                                                        parsedId = idVal.ValueKind switch
                                                                        {
                                                                            JsonValueKind.Number => TryGetInt(idVal),
                                                                            JsonValueKind.String when int.TryParse(idVal.GetString(), out var parsed) => parsed,
                                                                            _ => null
                                                                        };
                                                                    }
                                                                    itemSummary.Id = parsedId;

                                                                    // prefer explicit wishes if present
                                                                    if (it.TryGetProperty("wishes", out var wishes) && wishes.ValueKind == JsonValueKind.Array && wishes.GetArrayLength() > 0)
                                                                    {
                                                                        var wish = wishes[0];
                                                                        itemSummary.Percentage = wish.TryGetProperty("percentage", out var wp) && wp.ValueKind == JsonValueKind.Number ? wp.GetDouble() : 0;
                                                                        itemSummary.Absolute = wish.TryGetProperty("absolute", out var wa) && wa.ValueKind == JsonValueKind.Number ? wa.GetDouble() : 0;
                                                                        itemSummary.Specialization = wish.TryGetProperty("specialization", out var ws) && ws.ValueKind == JsonValueKind.String ? ws.GetString() : null;
                                                                    }
                                                                    else if (it.TryGetProperty("score_by_spec", out var sbs) && sbs.ValueKind == JsonValueKind.Object)
                                                                    {
                                                                        double bestPerc = 0; string? bestSpec = null;
                                                                        foreach (var prop in sbs.EnumerateObject())
                                                                        {
                                                                            if (prop.Value.ValueKind == JsonValueKind.Object && prop.Value.TryGetProperty("percentage", out var sp) && sp.ValueKind == JsonValueKind.Number)
                                                                            {
                                                                                var val = sp.GetDouble();
                                                                                if (val > bestPerc) { bestPerc = val; bestSpec = prop.Name; }
                                                                            }
                                                                        }
                                                                        itemSummary.Percentage = bestPerc;
                                                                        itemSummary.Specialization = bestSpec;
                                                                    }
                                                                }
                                                                else if (it.ValueKind == JsonValueKind.String)
                                                                {
                                                                    itemSummary.Name = it.GetString() ?? string.Empty;
                                                                }
                                                                // queue icon fetch for parallel resolution (deduplicated by id)
                                                                if (itemSummary.Id.HasValue)
                                                                {
                                                                    iconTasks.Add((itemSummary, GetWowheadIconAsync(itemSummary.Id)));
                                                                }
                                                                es.Items.Add(itemSummary);
                                                            }
                                                        }
                                                        ds.Encounters.Add(es);
                                                    }
                                                }
                                            }
                                            instanceSummary.Difficulties.Add(ds);
                                            // keep flattened difficulties for backward compatibility
                                            ch.Difficulties.Add(ds);
                                        }
                                    }
                                    ch.Instances.Add(instanceSummary);
                                }
                            }

                            // compute overall percentage as max across difficulties
                            ch.OverallPercentage = ch.Difficulties.Select(x => x.TotalPercentage).DefaultIfEmpty(0).Max();
                            summaries.Add(ch);
                        }

                        // resolve all icon fetches in parallel
                        if (iconTasks.Count > 0)
                        {
                            try
                            {
                                await Task.WhenAll(iconTasks.Select(t => t.Task));
                            }
                            catch
                            {
                                // ignore individual icon failures
                            }
                            foreach (var (item, task) in iconTasks)
                            {
                                try
                                {
                                    var iconUrl = task.IsCompletedSuccessfully ? task.Result : null;
                                    if (!string.IsNullOrEmpty(iconUrl)) item.Icon = iconUrl;
                                }
                                catch
                                {
                                    // ignore
                                }
                            }
                        }

                        if (summaries.Count > 0)
                        {
                            _wishlistSummaryCache[apiKeyOrUrl] = (DateTime.UtcNow.Add(_wishlistCacheTtl), summaries);
                            return summaries;
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "candidate wishlist summary url failed: {Url}", url);
                }
            }

            _logger.LogWarning("Failed to fetch wishlist summary from WowAudit using provided credential");
            return summaries;
        }

        /// <summary>
        /// Syncs characters from WowAudit wishlist summary and characters API into the database.
        /// Creates new characters with score 0 or updates metadata (realm/class) for existing ones.
        /// Characters no longer present in WowAudit are deactivated.
        /// </summary>
        public async Task<int> SyncGuildCharactersAsync(AppDbContext db, Guid guildId, string apiKey, CancellationToken cancellationToken = default)
        {
            var summary = await GetGuildWishlistSummaryAsync(apiKey);

            // fetch class info from the characters endpoint (wishlists often lack class data)
            var charInfos = await GetGuildCharactersAsync(apiKey);
            var classLookup = charInfos
                .Where(ci => !string.IsNullOrEmpty(ci.Name) && !string.IsNullOrEmpty(ci.Class))
                .GroupBy(ci => ci.Name)
                .ToDictionary(g => g.Key, g => g.First().Class);

            // track which names are still present in WowAudit
            var activeNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            int upserts = 0;

            foreach (var ch in summary)
            {
                activeNames.Add(ch.Name);

                // prefer class from characters API; fall back to wishlist data
                var charClass = classLookup.TryGetValue(ch.Name, out var cls) ? cls : ch.Class;

                var existing = await db.Characters.FirstOrDefaultAsync(
                    c => c.GuildId == guildId && c.Name == ch.Name, cancellationToken);

                if (existing == null)
                {
                    db.Characters.Add(new Character
                    {
                        Id = Guid.NewGuid(),
                        Name = ch.Name,
                        Realm = ch.Realm,
                        Class = charClass,
                        Score = 0,
                        IsActive = true,
                        GuildId = guildId
                    });
                }
                else
                {
                    existing.Realm = ch.Realm;
                    existing.IsActive = true;
                    // only update class if we have a non-empty value
                    if (!string.IsNullOrEmpty(charClass))
                        existing.Class = charClass;
                }
                upserts++;
            }

            // deactivate characters that are no longer in WowAudit
            var allGuildChars = await db.Characters
                .Where(c => c.GuildId == guildId && c.IsActive)
                .ToListAsync(cancellationToken);
            foreach (var c in allGuildChars)
            {
                if (!activeNames.Contains(c.Name))
                    c.IsActive = false;
            }

            await db.SaveChangesAsync(cancellationToken);
            return upserts;
        }

        private static int? TryGetInt(JsonElement el)
        {
            try { return el.GetInt32(); } catch { return null; }
        }
    }
}
