using System.Net.Http.Headers;
using System.Text.Json;
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

        public BlizzardService(HttpClient http, IConfiguration config, ILogger<BlizzardService> logger)
        {
            _http = http;
            _logger = logger;
            _clientId = config["Blizzard:ClientId"];
            _clientSecret = config["Blizzard:ClientSecret"];
        }

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
