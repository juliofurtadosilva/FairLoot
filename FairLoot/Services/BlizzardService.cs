using System.Net.Http.Headers;
using System.Text.Json;
using System.Collections.Concurrent;
using Microsoft.Extensions.Configuration;

namespace FairLoot.Services
{
    public class BlizzardService
    {
        private readonly HttpClient _http;
        private readonly ILogger<BlizzardService> _logger;
        private readonly string? _clientId;
        private readonly string? _clientSecret;
        private string? _accessToken;
        private DateTimeOffset _tokenExpiry = DateTimeOffset.MinValue;
        private readonly object _tokenLock = new object();

        // journal (encounter journal) caches — instances/encounters change rarely, cache long;
        // resolved media URLs use the same null-caching pattern as GetWowheadIconAsync.
        private static readonly TimeSpan _journalIndexTtl = TimeSpan.FromHours(24);
        private static readonly TimeSpan _mediaNullTtl = TimeSpan.FromHours(2);
        private static readonly ConcurrentDictionary<string, (DateTime Expiry, List<(int Id, string Name)> Data)> _journalInstanceIndexCache = new();
        private static readonly ConcurrentDictionary<int, (DateTime Expiry, List<(int Id, string Name)> Encounters)> _journalInstanceEncountersCache = new();
        private static readonly ConcurrentDictionary<int, (string? Url, DateTime CachedAt)> _journalInstanceImageCache = new();
        private static readonly ConcurrentDictionary<int, (DateTime Expiry, int? CreatureDisplayId)> _journalEncounterCreatureCache = new();
        private static readonly ConcurrentDictionary<int, (string? Url, DateTime CachedAt)> _creatureDisplayImageCache = new();
        private static readonly ConcurrentDictionary<string, (string? Url, DateTime CachedAt)> _bossImageByNameCache = new();
        private static readonly SemaphoreSlim _journalSearchSemaphore = new(15, 15);
        private static readonly ConcurrentDictionary<(int Id, string Locale), (DateTime Expiry, string? Name)> _instanceLocalizedNameCache = new();
        private static readonly ConcurrentDictionary<(int Id, string Locale), (DateTime Expiry, string? Name)> _encounterLocalizedNameCache = new();
        private static readonly ConcurrentDictionary<int, (DateTime Expiry, string? ExpansionName)> _instanceExpansionCache = new();
        // "boss name not found anywhere in the journal" result cache — short TTL so newly-indexed
        // content (e.g. a raid tier the Journal API just added) is picked up without a restart.
        private static readonly TimeSpan _encounterSearchNullTtl = TimeSpan.FromHours(2);
        private static readonly ConcurrentDictionary<string, (int EncounterId, DateTime CachedAt)> _encounterSearchCache = new();

        public BlizzardService(HttpClient http, IConfiguration config, ILogger<BlizzardService> logger)
        {
            _http = http;
            _logger = logger;
            _clientId = config["Blizzard:ClientId"];
            _clientSecret = config["Blizzard:ClientSecret"];
        }

        /// <summary>Get the equipped item level for a character via the Blizzard Profile API.</summary>
        // Character item-level fetch removed — feature disabled

        public bool HasCredentials() => !string.IsNullOrEmpty(_clientId) && !string.IsNullOrEmpty(_clientSecret);

        private async Task<bool> EnsureTokenAsync()
        {
            if (!HasCredentials()) return false;
            if (!string.IsNullOrEmpty(_accessToken) && DateTimeOffset.UtcNow < _tokenExpiry.AddSeconds(-60)) return true;

            // Use double-check with lock for thread safety. The lock protects against
            // multiple concurrent callers refreshing the token simultaneously.
            // While holding the lock we only check the cached value; the actual HTTP
            // call is made outside of the lock to avoid blocking threads.
            bool needsRefresh;
            lock (_tokenLock)
            {
                needsRefresh = string.IsNullOrEmpty(_accessToken) || DateTimeOffset.UtcNow >= _tokenExpiry.AddSeconds(-60);
            }
            if (!needsRefresh) return true;

            try
            {
                var req = new HttpRequestMessage(HttpMethod.Post, "https://us.battle.net/oauth/token");
                req.Content = new FormUrlEncodedContent(new[] { new KeyValuePair<string, string>("grant_type", "client_credentials") });
                var auth = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes($"{_clientId}:{_clientSecret}"));
                req.Headers.Authorization = new AuthenticationHeaderValue("Basic", auth);

                var res = await _http.SendAsync(req);
                if (!res.IsSuccessStatusCode)
                {
                    _logger.LogDebug("Blizzard token request failed: {Status}", res.StatusCode);
                    return false;
                }

                var txt = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(txt);
                var root = doc.RootElement;

                string? newToken = null;
                DateTimeOffset newExpiry = _tokenExpiry;
                if (root.TryGetProperty("access_token", out var at)) newToken = at.GetString();
                if (root.TryGetProperty("expires_in", out var ei) && ei.ValueKind == JsonValueKind.Number)
                {
                    newExpiry = DateTimeOffset.UtcNow.AddSeconds(ei.GetInt32());
                }

                lock (_tokenLock)
                {
                    _accessToken = newToken;
                    _tokenExpiry = newExpiry;
                }

                return !string.IsNullOrEmpty(_accessToken);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to get Blizzard token");
                return false;
            }
        }

        public async Task<string?> GetItemIconAsync(int? itemId)
        {
            if (itemId == null) return null;
            if (!HasCredentials()) return null;
            if (!await EnsureTokenAsync()) return null;

            try
            {
                var url = $"https://us.api.blizzard.com/data/wow/media/item/{itemId}?namespace=static-us&locale=en_US";
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                var res = await _http.SendAsync(req);
                if (!res.IsSuccessStatusCode) return null;
                var txt = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(txt);
                var root = doc.RootElement;
                if (root.TryGetProperty("assets", out var assets) && assets.ValueKind == JsonValueKind.Array)
                {
                    foreach (var a in assets.EnumerateArray())
                    {
                        if (a.TryGetProperty("key", out var key) && key.ValueKind == JsonValueKind.String && key.GetString() == "icon")
                        {
                            if (a.TryGetProperty("value", out var val) && val.ValueKind == JsonValueKind.String)
                                return val.GetString();
                        }
                    }
                }
                // fallback: some items use different structure
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to fetch item media for {ItemId}", itemId);
                return null;
            }
        }

        /// <summary>Convert a display name to a Blizzard API slug (lowercase, spaces→hyphens, remove special chars).</summary>
        public static string ToSlug(string name)
        {
            return name.Trim()
                .ToLowerInvariant()
                .Replace("'", "")
                .Replace("'", "")
                .Replace(" ", "-");
        }

        /// <summary>Get localized item name from Blizzard API.</summary>
        public async Task<string?> GetItemNameAsync(int itemId, string locale = "en_US")
        {
            if (!HasCredentials()) return null;
            if (!await EnsureTokenAsync()) return null;
            try
            {
                var url = $"https://us.api.blizzard.com/data/wow/item/{itemId}?namespace=static-us&locale={locale}";
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                var res = await _http.SendAsync(req);
                if (!res.IsSuccessStatusCode) return null;
                var txt = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(txt);
                if (doc.RootElement.TryGetProperty("name", out var nameEl) && nameEl.ValueKind == JsonValueKind.String)
                    return nameEl.GetString();
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to fetch item name for {ItemId} locale {Locale}", itemId, locale);
                return null;
            }
        }

        // WowAudit (source of the raid/boss names shown in the app) and Blizzard's own Journal API
        // are two independent data sources — their spelling of the same encounter can differ in
        // punctuation (hyphens, commas, ampersands) even when the words match. Normalize aggressively
        // so those differences don't break the exact-match lookup used to fetch the localized name/art.
        private static string NormalizeForMatch(string? s)
        {
            if (string.IsNullOrWhiteSpace(s)) return string.Empty;
            var t = s.Trim().ToLowerInvariant().Replace("'", "").Replace("'", "").Replace("’", "").Replace("`", "");
            var sb = new System.Text.StringBuilder(t.Length);
            foreach (var ch in t) sb.Append(char.IsLetterOrDigit(ch) ? ch : ' ');
            return string.Join(' ', sb.ToString().Split(' ', StringSplitOptions.RemoveEmptyEntries));
        }

        /// <summary>
        /// Match an encounter by name, tolerating a subtitle/epithet one source has and the other
        /// doesn't (e.g. WowAudit's "Belo'ren, Child of Al'ar" vs the Journal's plain "Belo'ren") —
        /// tries an exact normalized match first, then falls back to a prefix match either direction.
        /// </summary>
        private static (int Id, string Name) FindBestEncounterMatch(List<(int Id, string Name)> encounters, string normalizedTarget)
        {
            if (string.IsNullOrEmpty(normalizedTarget)) return default;
            var exact = encounters.FirstOrDefault(e => NormalizeForMatch(e.Name) == normalizedTarget);
            if (exact.Id != 0) return exact;
            return encounters.FirstOrDefault(e =>
            {
                var n = NormalizeForMatch(e.Name);
                return n.Length > 0 && (normalizedTarget.StartsWith(n) || n.StartsWith(normalizedTarget));
            });
        }

        /// <summary>List of all journal (encounter journal) raid/dungeon instances, cached ~24h.</summary>
        public async Task<List<(int Id, string Name)>> GetJournalInstanceIndexAsync(string region = "us")
        {
            if (_journalInstanceIndexCache.TryGetValue(region, out var cached) && cached.Expiry > DateTime.UtcNow)
                return cached.Data;
            if (!HasCredentials()) return new List<(int, string)>();
            if (!await EnsureTokenAsync()) return new List<(int, string)>();

            try
            {
                var host = RegionHost(region);
                var url = $"https://{host}/data/wow/journal-instance/index?namespace=static-{region}&locale=en_US";
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                var res = await _http.SendAsync(req);
                if (!res.IsSuccessStatusCode) return new List<(int, string)>();

                var txt = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(txt);
                var list = new List<(int, string)>();
                if (doc.RootElement.TryGetProperty("instances", out var insts) && insts.ValueKind == JsonValueKind.Array)
                {
                    foreach (var i in insts.EnumerateArray())
                    {
                        var id = i.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.Number ? idEl.GetInt32() : 0;
                        var name = i.TryGetProperty("name", out var nameEl) ? nameEl.GetString() : null;
                        if (id > 0 && !string.IsNullOrEmpty(name)) list.Add((id, name));
                    }
                }
                _journalInstanceIndexCache[region] = (DateTime.UtcNow.Add(_journalIndexTtl), list);
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to fetch journal-instance index");
                return new List<(int, string)>();
            }
        }

        /// <summary>Boss encounters for a journal instance, cached ~24h.</summary>
        public async Task<List<(int Id, string Name)>> GetJournalInstanceEncountersAsync(int instanceId, string region = "us")
        {
            if (_journalInstanceEncountersCache.TryGetValue(instanceId, out var cached) && cached.Expiry > DateTime.UtcNow)
                return cached.Encounters;
            if (!HasCredentials()) return new List<(int, string)>();
            if (!await EnsureTokenAsync()) return new List<(int, string)>();

            try
            {
                var host = RegionHost(region);
                var url = $"https://{host}/data/wow/journal-instance/{instanceId}?namespace=static-{region}&locale=en_US";
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                var res = await _http.SendAsync(req);
                if (!res.IsSuccessStatusCode) return new List<(int, string)>();

                var txt = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(txt);
                var list = new List<(int, string)>();
                if (doc.RootElement.TryGetProperty("encounters", out var encs) && encs.ValueKind == JsonValueKind.Array)
                {
                    foreach (var e in encs.EnumerateArray())
                    {
                        var id = e.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.Number ? idEl.GetInt32() : 0;
                        var name = e.TryGetProperty("name", out var nameEl) ? nameEl.GetString() : null;
                        if (id > 0 && !string.IsNullOrEmpty(name)) list.Add((id, name));
                    }
                }
                _journalInstanceEncountersCache[instanceId] = (DateTime.UtcNow.Add(_journalIndexTtl), list);
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to fetch journal-instance encounters for {InstanceId}", instanceId);
                return new List<(int, string)>();
            }
        }

        /// <summary>Background/tile art for a raid instance (used as the raid banner image).</summary>
        public async Task<string?> GetJournalInstanceImageAsync(int instanceId, string region = "us")
        {
            if (_journalInstanceImageCache.TryGetValue(instanceId, out var cached))
            {
                if (cached.Url != null) return cached.Url;
                if (DateTime.UtcNow - cached.CachedAt < _mediaNullTtl) return null;
            }
            if (!HasCredentials()) return null;
            if (!await EnsureTokenAsync()) return null;

            try
            {
                var host = RegionHost(region);
                var url = $"https://{host}/data/wow/media/journal-instance/{instanceId}?namespace=static-{region}&locale=en_US";
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                var res = await _http.SendAsync(req);
                string? found = null;
                if (res.IsSuccessStatusCode)
                {
                    var txt = await res.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(txt);
                    if (doc.RootElement.TryGetProperty("assets", out var assets) && assets.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var a in assets.EnumerateArray())
                        {
                            if (a.TryGetProperty("key", out var key) && key.ValueKind == JsonValueKind.String
                                && (key.GetString() == "tile" || key.GetString() == "background")
                                && a.TryGetProperty("value", out var val) && val.ValueKind == JsonValueKind.String)
                            {
                                found = val.GetString();
                                if (key.GetString() == "tile") break; // prefer tile over background
                            }
                        }
                    }
                }
                _journalInstanceImageCache[instanceId] = (found, DateTime.UtcNow);
                return found;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to fetch journal-instance media for {InstanceId}", instanceId);
                _journalInstanceImageCache[instanceId] = (null, DateTime.UtcNow);
                return null;
            }
        }

        /// <summary>First creature (usually the main boss model) linked to a journal encounter, cached ~24h.</summary>
        public async Task<int?> GetJournalEncounterPrimaryCreatureDisplayIdAsync(int encounterId, string region = "us")
        {
            if (_journalEncounterCreatureCache.TryGetValue(encounterId, out var cached) && cached.Expiry > DateTime.UtcNow)
                return cached.CreatureDisplayId;
            if (!HasCredentials()) return null;
            if (!await EnsureTokenAsync()) return null;

            try
            {
                var host = RegionHost(region);
                var url = $"https://{host}/data/wow/journal-encounter/{encounterId}?namespace=static-{region}&locale=en_US";
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                var res = await _http.SendAsync(req);
                int? displayId = null;
                if (res.IsSuccessStatusCode)
                {
                    var txt = await res.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(txt);
                    if (doc.RootElement.TryGetProperty("creatures", out var creatures) && creatures.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var c in creatures.EnumerateArray())
                        {
                            if (c.TryGetProperty("creature_display", out var cd) && cd.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.Number)
                            {
                                displayId = idEl.GetInt32();
                                break;
                            }
                        }
                    }
                }
                _journalEncounterCreatureCache[encounterId] = (DateTime.UtcNow.Add(_journalIndexTtl), displayId);
                return displayId;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to fetch journal-encounter for {EncounterId}", encounterId);
                _journalEncounterCreatureCache[encounterId] = (DateTime.UtcNow.Add(_journalIndexTtl), null);
                return null;
            }
        }

        /// <summary>Rendered "zoom" portrait for a creature display (used as the boss thumbnail).</summary>
        public async Task<string?> GetCreatureDisplayImageAsync(int displayId, string region = "us")
        {
            if (_creatureDisplayImageCache.TryGetValue(displayId, out var cached))
            {
                if (cached.Url != null) return cached.Url;
                if (DateTime.UtcNow - cached.CachedAt < _mediaNullTtl) return null;
            }
            if (!HasCredentials()) return null;
            if (!await EnsureTokenAsync()) return null;

            try
            {
                var host = RegionHost(region);
                var url = $"https://{host}/data/wow/media/creature-display/{displayId}?namespace=static-{region}&locale=en_US";
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                var res = await _http.SendAsync(req);
                string? found = null;
                if (res.IsSuccessStatusCode)
                {
                    var txt = await res.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(txt);
                    if (doc.RootElement.TryGetProperty("assets", out var assets) && assets.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var a in assets.EnumerateArray())
                        {
                            if (a.TryGetProperty("key", out var key) && key.ValueKind == JsonValueKind.String && key.GetString() == "zoom"
                                && a.TryGetProperty("value", out var val) && val.ValueKind == JsonValueKind.String)
                            {
                                found = val.GetString();
                                break;
                            }
                        }
                    }
                }
                _creatureDisplayImageCache[displayId] = (found, DateTime.UtcNow);
                return found;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to fetch creature-display media for {DisplayId}", displayId);
                _creatureDisplayImageCache[displayId] = (null, DateTime.UtcNow);
                return null;
            }
        }

        /// <summary>Resolve a raid's banner image automatically by name via the Blizzard Journal API.</summary>
        public async Task<string?> ResolveRaidImageAsync(string raidName, string region = "us")
        {
            var instances = await GetJournalInstanceIndexAsync(region);
            var target = NormalizeForMatch(raidName);
            var inst = instances.FirstOrDefault(i => NormalizeForMatch(i.Name) == target);
            if (inst.Id == 0) return null;
            return await GetJournalInstanceImageAsync(inst.Id, region);
        }

        /// <summary>Resolve a boss's thumbnail image automatically by raid+boss name via the Blizzard Journal API.</summary>
        public async Task<string?> ResolveBossImageAsync(string raidName, string bossName, string region = "us")
        {
            var instances = await GetJournalInstanceIndexAsync(region);
            var raidTarget = NormalizeForMatch(raidName);
            var inst = instances.FirstOrDefault(i => NormalizeForMatch(i.Name) == raidTarget);
            if (inst.Id == 0) return null;

            var encounters = await GetJournalInstanceEncountersAsync(inst.Id, region);
            var bossTarget = NormalizeForMatch(bossName);
            var enc = FindBestEncounterMatch(encounters, bossTarget);
            if (enc.Id == 0) return null;

            var displayId = await GetJournalEncounterPrimaryCreatureDisplayIdAsync(enc.Id, region);
            if (displayId == null) return null;
            return await GetCreatureDisplayImageAsync(displayId.Value, region);
        }

        /// <summary>
        /// Find a journal encounter id anywhere in the journal by (normalized) boss name — bounded
        /// concurrency across every instance, everything cached per-instance afterward so repeat
        /// lookups (including for other bosses) are fast. Returns 0 if not found.
        /// A boss name that never matches anything (e.g. current/PTR content the Journal API hasn't
        /// indexed yet) is cached as "not found" for a couple hours so it stops re-scanning every
        /// journal instance on every single request — that repeated full scan was the "delay" some
        /// unmatched bosses had on every language switch.
        /// </summary>
        private async Task<int> FindEncounterIdAnywhereAsync(string normalizedBossName, string region)
        {
            if (_encounterSearchCache.TryGetValue(normalizedBossName, out var cachedSearch))
            {
                if (cachedSearch.EncounterId != 0) return cachedSearch.EncounterId;
                if (DateTime.UtcNow - cachedSearch.CachedAt < _encounterSearchNullTtl) return 0;
            }

            var instances = await GetJournalInstanceIndexAsync(region);
            var tasks = instances.Select(async inst =>
            {
                await _journalSearchSemaphore.WaitAsync();
                try
                {
                    var encounters = await GetJournalInstanceEncountersAsync(inst.Id, region);
                    return FindBestEncounterMatch(encounters, normalizedBossName).Id;
                }
                finally
                {
                    _journalSearchSemaphore.Release();
                }
            });

            var results = await Task.WhenAll(tasks);
            var found = results.FirstOrDefault(id => id != 0);
            _encounterSearchCache[normalizedBossName] = (found, DateTime.UtcNow);
            return found;
        }

        /// <summary>
        /// Resolve a boss's portrait when the raid/instance isn't known (e.g. history records that only
        /// store the boss name). Searches every journal instance — bounded concurrency, everything cached
        /// per-instance afterward so repeat lookups (including for other bosses) are fast.
        /// </summary>
        public async Task<string?> ResolveBossImageByNameAsync(string bossName, string region = "us")
        {
            var target = NormalizeForMatch(bossName);
            if (string.IsNullOrEmpty(target)) return null;

            if (_bossImageByNameCache.TryGetValue(target, out var cached))
            {
                if (cached.Url != null) return cached.Url;
                if (DateTime.UtcNow - cached.CachedAt < _mediaNullTtl) return null;
            }

            var encounterId = await FindEncounterIdAnywhereAsync(target, region);

            string? resolved = null;
            if (encounterId != 0)
            {
                var displayId = await GetJournalEncounterPrimaryCreatureDisplayIdAsync(encounterId, region);
                if (displayId != null) resolved = await GetCreatureDisplayImageAsync(displayId.Value, region);
            }

            _bossImageByNameCache[target] = (resolved, DateTime.UtcNow);
            return resolved;
        }

        /// <summary>Localized display name for a journal instance (raid), cached per instance+locale ~24h.</summary>
        public async Task<string?> GetInstanceLocalizedNameAsync(int instanceId, string locale, string region = "us")
        {
            var key = (instanceId, locale);
            if (_instanceLocalizedNameCache.TryGetValue(key, out var cached) && cached.Expiry > DateTime.UtcNow)
                return cached.Name;
            if (!HasCredentials()) return null;
            if (!await EnsureTokenAsync()) return null;

            try
            {
                var host = RegionHost(region);
                var url = $"https://{host}/data/wow/journal-instance/{instanceId}?namespace=static-{region}&locale={locale}";
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                var res = await _http.SendAsync(req);
                string? name = null;
                if (res.IsSuccessStatusCode)
                {
                    var txt = await res.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(txt);
                    if (doc.RootElement.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String) name = n.GetString();
                }
                _instanceLocalizedNameCache[key] = (DateTime.UtcNow.Add(_journalIndexTtl), name);
                return name;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to fetch localized instance name for {InstanceId}/{Locale}", instanceId, locale);
                return null;
            }
        }

        /// <summary>Localized display name for a journal encounter (boss), cached per encounter+locale ~24h.</summary>
        public async Task<string?> GetEncounterLocalizedNameAsync(int encounterId, string locale, string region = "us")
        {
            var key = (encounterId, locale);
            if (_encounterLocalizedNameCache.TryGetValue(key, out var cached) && cached.Expiry > DateTime.UtcNow)
                return cached.Name;
            if (!HasCredentials()) return null;
            if (!await EnsureTokenAsync()) return null;

            try
            {
                var host = RegionHost(region);
                var url = $"https://{host}/data/wow/journal-encounter/{encounterId}?namespace=static-{region}&locale={locale}";
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                var res = await _http.SendAsync(req);
                string? name = null;
                if (res.IsSuccessStatusCode)
                {
                    var txt = await res.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(txt);
                    if (doc.RootElement.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String) name = n.GetString();
                }
                _encounterLocalizedNameCache[key] = (DateTime.UtcNow.Add(_journalIndexTtl), name);
                return name;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to fetch localized encounter name for {EncounterId}/{Locale}", encounterId, locale);
                return null;
            }
        }

        /// <summary>Expansion name (e.g. "Midnight") for a journal instance, cached ~24h.</summary>
        public async Task<string?> GetJournalInstanceExpansionNameAsync(int instanceId, string region = "us")
        {
            if (_instanceExpansionCache.TryGetValue(instanceId, out var cached) && cached.Expiry > DateTime.UtcNow)
                return cached.ExpansionName;
            if (!HasCredentials()) return null;
            if (!await EnsureTokenAsync()) return null;

            try
            {
                var host = RegionHost(region);
                var url = $"https://{host}/data/wow/journal-instance/{instanceId}?namespace=static-{region}&locale=en_US";
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                var res = await _http.SendAsync(req);
                string? name = null;
                if (res.IsSuccessStatusCode)
                {
                    var txt = await res.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(txt);
                    if (doc.RootElement.TryGetProperty("expansion", out var exp) && exp.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String)
                        name = n.GetString();
                }
                _instanceExpansionCache[instanceId] = (DateTime.UtcNow.Add(_journalIndexTtl), name);
                return name;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to fetch expansion name for instance {InstanceId}", instanceId);
                return null;
            }
        }

        /// <summary>Resolve a raid's expansion name (e.g. "Midnight") by its (English) WowAudit name.</summary>
        public async Task<string?> ResolveRaidExpansionNameAsync(string raidName, string region = "us")
        {
            var instances = await GetJournalInstanceIndexAsync(region);
            var target = NormalizeForMatch(raidName);
            var inst = instances.FirstOrDefault(i => NormalizeForMatch(i.Name) == target);
            if (inst.Id == 0) return null;
            return await GetJournalInstanceExpansionNameAsync(inst.Id, region);
        }

        /// <summary>Resolve a raid's localized display name by its (English) WowAudit name.</summary>
        public async Task<string?> ResolveRaidLocalizedNameAsync(string raidName, string locale, string region = "us")
        {
            var instances = await GetJournalInstanceIndexAsync(region);
            var target = NormalizeForMatch(raidName);
            var inst = instances.FirstOrDefault(i => NormalizeForMatch(i.Name) == target);
            if (inst.Id == 0) return null;
            return await GetInstanceLocalizedNameAsync(inst.Id, locale, region);
        }

        /// <summary>
        /// Resolve a boss's localized display name. Uses the raid name for a fast targeted lookup when
        /// known; otherwise searches every instance (same as ResolveBossImageByNameAsync).
        /// </summary>
        public async Task<string?> ResolveBossLocalizedNameAsync(string? raidName, string bossName, string locale, string region = "us")
        {
            var bossTarget = NormalizeForMatch(bossName);
            var encounterId = 0;

            if (!string.IsNullOrWhiteSpace(raidName))
            {
                var instances = await GetJournalInstanceIndexAsync(region);
                var raidTarget = NormalizeForMatch(raidName);
                var inst = instances.FirstOrDefault(i => NormalizeForMatch(i.Name) == raidTarget);
                if (inst.Id != 0)
                {
                    var encounters = await GetJournalInstanceEncountersAsync(inst.Id, region);
                    encounterId = FindBestEncounterMatch(encounters, bossTarget).Id;
                }
            }

            if (encounterId == 0)
                encounterId = await FindEncounterIdAnywhereAsync(bossTarget, region);

            if (encounterId == 0) return null;
            return await GetEncounterLocalizedNameAsync(encounterId, locale, region);
        }

        private static string RegionHost(string region) => region switch
        {
            "eu" => "eu.api.blizzard.com",
            "kr" => "kr.api.blizzard.com",
            "tw" => "tw.api.blizzard.com",
            _ => "us.api.blizzard.com"
        };

        /// <summary>Returns a list of realm objects { slug, name } for the given region.</summary>
        public async Task<List<RealmInfo>?> GetRealmsAsync(string region = "us")
        {
            if (!HasCredentials()) return null;
            if (!await EnsureTokenAsync()) return null;

            try
            {
                var host = RegionHost(region);
                var url = $"https://{host}/data/wow/realm/index?namespace=dynamic-{region}&locale=en_US";
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                var res = await _http.SendAsync(req);
                if (!res.IsSuccessStatusCode) return null;
                var txt = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(txt);
                var root = doc.RootElement;
                if (!root.TryGetProperty("realms", out var realms) || realms.ValueKind != JsonValueKind.Array)
                    return null;

                var list = new List<RealmInfo>();
                foreach (var r in realms.EnumerateArray())
                {
                    var slug = r.TryGetProperty("slug", out var s) ? s.GetString() : null;
                    var rName = r.TryGetProperty("name", out var n) ? n.GetString() : null;
                    if (slug != null && rName != null)
                        list.Add(new RealmInfo { Slug = slug, Name = rName });
                }
                return list;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to fetch realms for region {Region}", region);
                return null;
            }
        }

        /// <summary>Look up a guild via Blizzard API. Returns basic info or null if not found.</summary>
        public async Task<BlizzardGuildInfo?> GetGuildAsync(string realmSlug, string guildNameSlug, string region = "us")
        {
            if (!HasCredentials()) return null;
            if (!await EnsureTokenAsync()) return null;

            try
            {
                var host = RegionHost(region);
                var url = $"https://{host}/data/wow/guild/{realmSlug}/{guildNameSlug}?namespace=profile-{region}&locale=en_US";
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                var res = await _http.SendAsync(req);
                if (!res.IsSuccessStatusCode) return null;
                var txt = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(txt);
                var root = doc.RootElement;

                var info = new BlizzardGuildInfo
                {
                    Name = root.TryGetProperty("name", out var gn) ? gn.GetString() : guildNameSlug,
                    Faction = root.TryGetProperty("faction", out var f) && f.TryGetProperty("name", out var fn) ? fn.GetString() : null,
                    Realm = root.TryGetProperty("realm", out var rm) && rm.TryGetProperty("name", out var rn) ? rn.GetString() : realmSlug,
                    MemberCount = root.TryGetProperty("member_count", out var mc) && mc.ValueKind == JsonValueKind.Number ? mc.GetInt32() : 0
                };
                return info;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to fetch guild {Realm}/{Guild}", realmSlug, guildNameSlug);
                return null;
            }
        }

        /// <summary>Verify that a character is the Guild Master (rank 0) of a guild.</summary>
        public async Task<GuildMasterVerification> VerifyGuildMasterAsync(string realmSlug, string guildNameSlug, string characterName, string region = "us")
        {
            var result = new GuildMasterVerification();
            if (!HasCredentials()) { result.Error = "Blizzard API not configured"; return result; }
            if (!await EnsureTokenAsync()) { result.Error = "Failed to obtain Blizzard token"; return result; }

            try
            {
                var host = RegionHost(region);
                var url = $"https://{host}/data/wow/guild/{realmSlug}/{guildNameSlug}/roster?namespace=profile-{region}&locale=en_US";
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                var res = await _http.SendAsync(req);
                if (!res.IsSuccessStatusCode)
                {
                    result.Error = "Guild not found on Blizzard API";
                    return result;
                }

                var txt = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(txt);
                var root = doc.RootElement;
                if (!root.TryGetProperty("members", out var members) || members.ValueKind != JsonValueKind.Array)
                {
                    result.Error = "Could not read roster";
                    return result;
                }

                var charSlug = characterName.Trim().ToLowerInvariant();
                foreach (var m in members.EnumerateArray())
                {
                    var rank = m.TryGetProperty("rank", out var r) && r.ValueKind == JsonValueKind.Number ? r.GetInt32() : -1;
                    var name = m.TryGetProperty("character", out var c) && c.TryGetProperty("name", out var cn) ? cn.GetString() : null;
                    if (rank == 0 && name != null)
                    {
                        result.GuildMasterName = name;
                        result.IsGuildMaster = string.Equals(name, characterName.Trim(), StringComparison.OrdinalIgnoreCase);
                        break;
                    }
                }

                if (result.GuildMasterName == null)
                    result.Error = "Could not determine Guild Master";

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to verify GM for {Realm}/{Guild}", realmSlug, guildNameSlug);
                result.Error = "Error verifying Guild Master";
                return result;
            }
        }

        // ─── Battle.net OAuth2 ──────────────────────────────────────────────

        private static string RegionOAuthHost(string region) => region switch
        {
            "eu" => "eu.battle.net",
            "kr" => "apac.battle.net",
            "tw" => "apac.battle.net",
            _ => "us.battle.net"
        };

        /// <summary>Build the Battle.net OAuth2 authorize URL.</summary>
        public string? GetAuthorizeUrl(string redirectUri, string state, string region = "us")
        {
            if (!HasCredentials()) return null;
            var host = RegionOAuthHost(region);
            return $"https://{host}/oauth/authorize?client_id={_clientId}&redirect_uri={Uri.EscapeDataString(redirectUri)}&response_type=code&scope=wow.profile&state={Uri.EscapeDataString(state)}";
        }

        /// <summary>Exchange an OAuth2 authorization code for a user access token.</summary>
        public async Task<string?> ExchangeCodeForTokenAsync(string code, string redirectUri, string region = "us")
        {
            if (!HasCredentials()) return null;
            try
            {
                var host = RegionOAuthHost(region);
                var url = $"https://{host}/oauth/token";
                var req = new HttpRequestMessage(HttpMethod.Post, url);
                req.Content = new FormUrlEncodedContent(new[]
                {
                    new KeyValuePair<string, string>("grant_type", "authorization_code"),
                    new KeyValuePair<string, string>("code", code),
                    new KeyValuePair<string, string>("redirect_uri", redirectUri),
                });
                var auth = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes($"{_clientId}:{_clientSecret}"));
                req.Headers.Authorization = new AuthenticationHeaderValue("Basic", auth);

                var res = await _http.SendAsync(req);
                if (!res.IsSuccessStatusCode)
                {
                    _logger.LogDebug("Blizzard code exchange failed: {Status}", res.StatusCode);
                    return null;
                }

                var txt = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(txt);
                if (doc.RootElement.TryGetProperty("access_token", out var at))
                    return at.GetString();
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to exchange Battle.net code");
                return null;
            }
        }

        /// <summary>Get Battle.net user info (sub / battletag) from user token.</summary>
        public async Task<BnetUserInfo?> GetUserInfoAsync(string userToken, string region = "us")
        {
            try
            {
                var host = RegionOAuthHost(region);
                var url = $"https://{host}/oauth/userinfo";
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userToken);
                var res = await _http.SendAsync(req);
                if (!res.IsSuccessStatusCode) return null;

                var txt = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(txt);
                var root = doc.RootElement;

                return new BnetUserInfo
                {
                    Sub = root.TryGetProperty("sub", out var sub) ? sub.GetString() : root.TryGetProperty("id", out var id) ? id.ToString() : null,
                    BattleTag = root.TryGetProperty("battletag", out var bt) ? bt.GetString() : null,
                };
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to fetch Battle.net userinfo");
                return null;
            }
        }

        /// <summary>Get the user's WoW characters using their OAuth token.</summary>
        public async Task<List<BnetCharacterInfo>?> GetUserCharactersAsync(string userToken, string region = "us")
        {
            try
            {
                var host = RegionHost(region);
                var url = $"https://{host}/profile/user/wow?namespace=profile-{region}&locale=en_US";
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userToken);
                var res = await _http.SendAsync(req);
                if (!res.IsSuccessStatusCode) return null;

                var txt = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(txt);
                var root = doc.RootElement;

                var characters = new List<BnetCharacterInfo>();

                if (!root.TryGetProperty("wow_accounts", out var accounts) || accounts.ValueKind != JsonValueKind.Array)
                    return characters;

                foreach (var acct in accounts.EnumerateArray())
                {
                    if (!acct.TryGetProperty("characters", out var chars) || chars.ValueKind != JsonValueKind.Array)
                        continue;
                    foreach (var c in chars.EnumerateArray())
                    {
                        var name = c.TryGetProperty("name", out var n) ? n.GetString() : null;
                        var level = c.TryGetProperty("level", out var l) && l.ValueKind == JsonValueKind.Number ? l.GetInt32() : 0;
                        var realmSlug = c.TryGetProperty("realm", out var r) && r.TryGetProperty("slug", out var rs) ? rs.GetString() : null;
                        var realmName = c.TryGetProperty("realm", out var r2) && r2.TryGetProperty("name", out var rn) ? rn.GetString() : null;
                        var className = c.TryGetProperty("playable_class", out var pc) && pc.TryGetProperty("name", out var pcn) ? pcn.GetString() : null;
                        var raceName = c.TryGetProperty("playable_race", out var pr) && pr.TryGetProperty("name", out var prn) ? prn.GetString() : null;
                        var faction = c.TryGetProperty("faction", out var f) && f.TryGetProperty("name", out var fn) ? fn.GetString() : null;

                        if (name != null && realmSlug != null)
                        {
                            characters.Add(new BnetCharacterInfo
                            {
                                Name = name,
                                RealmSlug = realmSlug,
                                RealmName = realmName ?? realmSlug,
                                Level = level,
                                ClassName = className,
                                RaceName = raceName,
                                Faction = faction,
                            });
                        }
                    }
                }

                return characters;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to fetch user WoW characters");
                return null;
            }
        }

        /// <summary>Get guild info for a specific character using client credentials.</summary>
        public async Task<CharacterGuildInfo?> GetCharacterGuildInfoAsync(string realmSlug, string characterName, string region = "us")
        {
            if (!HasCredentials()) return null;
            if (!await EnsureTokenAsync()) return null;

            try
            {
                var host = RegionHost(region);
                var charSlug = characterName.Trim().ToLowerInvariant();
                var url = $"https://{host}/profile/wow/character/{realmSlug}/{charSlug}?namespace=profile-{region}&locale=en_US";
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                var res = await _http.SendAsync(req);
                if (!res.IsSuccessStatusCode) return null;

                var txt = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(txt);
                var root = doc.RootElement;

                if (!root.TryGetProperty("guild", out var guild))
                    return new CharacterGuildInfo(); // character has no guild

                return new CharacterGuildInfo
                {
                    GuildName = guild.TryGetProperty("name", out var gn) ? gn.GetString() : null,
                    GuildRealmSlug = guild.TryGetProperty("realm", out var gr) && gr.TryGetProperty("slug", out var gs) ? gs.GetString() : null,
                    GuildRealmName = guild.TryGetProperty("realm", out var gr2) && gr2.TryGetProperty("name", out var grn) ? grn.GetString() : null,
                    Faction = guild.TryGetProperty("faction", out var f) && f.TryGetProperty("name", out var fn) ? fn.GetString() : null,
                };
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to fetch character guild for {Realm}/{Char}", realmSlug, characterName);
                return null;
            }
        }

        /// <summary>Enrich characters with guild info and rank (fetches character summary for top-level chars).</summary>
        public async Task<List<BnetCharacterInfo>> EnrichCharactersWithGuildsAsync(List<BnetCharacterInfo> characters, string region = "us")
        {
            // Only enrich max-level characters to reduce API calls
            var candidates = characters
                .OrderByDescending(c => c.Level)
                .Take(12)
                .ToList();

            // Cache roster lookups per guild to avoid duplicate calls
            var rosterCache = new Dictionary<string, Dictionary<string, int>>();

            foreach (var c in candidates)
            {
                var guildInfo = await GetCharacterGuildInfoAsync(c.RealmSlug, c.Name, region);
                if (guildInfo != null && guildInfo.GuildName != null)
                {
                    c.GuildName = guildInfo.GuildName;
                    c.GuildRealmSlug = guildInfo.GuildRealmSlug;
                    c.GuildRealmName = guildInfo.GuildRealmName;

                    // Fetch rank from roster (cached per guild)
                    var guildKey = $"{guildInfo.GuildRealmSlug}/{BlizzardService.ToSlug(guildInfo.GuildName)}";
                    if (!rosterCache.ContainsKey(guildKey))
                    {
                        var roster = await GetGuildRosterRanksAsync(guildInfo.GuildRealmSlug!, ToSlug(guildInfo.GuildName!), region);
                        rosterCache[guildKey] = roster ?? new Dictionary<string, int>();
                    }

                    var ranks = rosterCache[guildKey];
                    var charNameLower = c.Name.ToLowerInvariant();
                    if (ranks.TryGetValue(charNameLower, out var rank))
                        c.GuildRank = rank;
                }
            }

            return candidates;
        }

        /// <summary>Get all character names and ranks from a guild roster. Returns dict of lowercase name → rank.</summary>
        private async Task<Dictionary<string, int>?> GetGuildRosterRanksAsync(string realmSlug, string guildNameSlug, string region = "us")
        {
            if (!HasCredentials()) return null;
            if (!await EnsureTokenAsync()) return null;

            try
            {
                var host = RegionHost(region);
                var url = $"https://{host}/data/wow/guild/{realmSlug}/{guildNameSlug}/roster?namespace=profile-{region}&locale=en_US";
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                var res = await _http.SendAsync(req);
                if (!res.IsSuccessStatusCode) return null;

                var txt = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(txt);
                var root = doc.RootElement;
                if (!root.TryGetProperty("members", out var members) || members.ValueKind != JsonValueKind.Array)
                    return null;

                var result = new Dictionary<string, int>();
                foreach (var m in members.EnumerateArray())
                {
                    var name = m.TryGetProperty("character", out var c) && c.TryGetProperty("name", out var cn) ? cn.GetString() : null;
                    var rank = m.TryGetProperty("rank", out var r) && r.ValueKind == JsonValueKind.Number ? r.GetInt32() : -1;
                    if (name != null)
                        result[name.ToLowerInvariant()] = rank;
                }
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to get roster for {Realm}/{Guild}", realmSlug, guildNameSlug);
                return null;
            }
        }

        /// <summary>Get a character's rank in a specific guild roster. Returns null if not found.</summary>
        public async Task<int?> GetCharacterRankAsync(string realmSlug, string guildNameSlug, string characterName, string region = "us")
        {
            if (!HasCredentials()) return null;
            if (!await EnsureTokenAsync()) return null;

            try
            {
                var host = RegionHost(region);
                var url = $"https://{host}/data/wow/guild/{realmSlug}/{guildNameSlug}/roster?namespace=profile-{region}&locale=en_US";
                var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                var res = await _http.SendAsync(req);
                if (!res.IsSuccessStatusCode) return null;

                var txt = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(txt);
                var root = doc.RootElement;
                if (!root.TryGetProperty("members", out var members) || members.ValueKind != JsonValueKind.Array)
                    return null;

                foreach (var m in members.EnumerateArray())
                {
                    var name = m.TryGetProperty("character", out var c) && c.TryGetProperty("name", out var cn) ? cn.GetString() : null;
                    var rank = m.TryGetProperty("rank", out var r) && r.ValueKind == JsonValueKind.Number ? r.GetInt32() : -1;
                    if (name != null && string.Equals(name, characterName.Trim(), StringComparison.OrdinalIgnoreCase))
                        return rank;
                }

                return null; // character not found in roster
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to get rank for {Char} in {Realm}/{Guild}", characterName, realmSlug, guildNameSlug);
                return null;
            }
        }
    }

    public class RealmInfo
    {
        public string Slug { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
    }

    public class BlizzardGuildInfo
    {
        public string? Name { get; set; }
        public string? Faction { get; set; }
        public string? Realm { get; set; }
        public int MemberCount { get; set; }
    }

    public class GuildMasterVerification
    {
        public bool IsGuildMaster { get; set; }
        public string? GuildMasterName { get; set; }
        public string? Error { get; set; }
    }

    public class BnetCharacterInfo
    {
        public string Name { get; set; } = string.Empty;
        public string RealmSlug { get; set; } = string.Empty;
        public string RealmName { get; set; } = string.Empty;
        public int Level { get; set; }
        public string? ClassName { get; set; }
        public string? RaceName { get; set; }
        public string? Faction { get; set; }
        public string? GuildName { get; set; }
        public string? GuildRealmSlug { get; set; }
        public string? GuildRealmName { get; set; }
        /// <summary>Rank in the guild roster (0 = GM, 1 = Officer, etc.). Null if unknown.</summary>
        public int? GuildRank { get; set; }
    }

    public class CharacterGuildInfo
    {
        public string? GuildName { get; set; }
        public string? GuildRealmSlug { get; set; }
        public string? GuildRealmName { get; set; }
        public string? Faction { get; set; }
    }

    public class BnetUserInfo
    {
        public string? Sub { get; set; }
        public string? BattleTag { get; set; }
    }
}
