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

        private bool HasCredentials() => !string.IsNullOrEmpty(_clientId) && !string.IsNullOrEmpty(_clientSecret);

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
    }
}
