using System.Text.Json;
using System.Text.RegularExpressions;

namespace FairLoot.Services
{
    public enum ReportSource { Raidbots, QuestionablyEpic }

    public record DetectedReport(ReportSource Source, string ReportId, string? CharacterName, string? Realm, string? Region, string? Spec, string? Difficulty);

    /// <summary>
    /// Parses a pasted Raidbots (SimC/Droptimizer) or QuestionablyEpic upgrade-report link: extracts the
    /// report id and, from each site's own public data, which character it belongs to — so the guild leader
    /// doesn't have to manually say who the report is for.
    /// </summary>
    public class ReportLinkService
    {
        private readonly HttpClient _http;
        private readonly ILogger<ReportLinkService> _logger;

        public ReportLinkService(HttpClient http, ILogger<ReportLinkService> logger)
        {
            _http = http;
            _logger = logger;
        }

        public static (ReportSource Source, string ReportId)? ParseUrl(string url)
        {
            if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri)) return null;

            var segments = uri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (segments.Length == 0) return null;
            var reportId = segments[^1];

            if (uri.Host.Contains("raidbots.com", StringComparison.OrdinalIgnoreCase))
                return (ReportSource.Raidbots, reportId);
            if (uri.Host.Contains("questionablyepic.com", StringComparison.OrdinalIgnoreCase))
                return (ReportSource.QuestionablyEpic, reportId);
            return null;
        }

        public async Task<DetectedReport?> DetectAsync(string url)
        {
            var parsed = ParseUrl(url);
            if (parsed == null) return null;
            var (source, reportId) = parsed.Value;

            return source switch
            {
                ReportSource.Raidbots => await DetectRaidbotsAsync(reportId),
                ReportSource.QuestionablyEpic => await DetectQuestionablyEpicAsync(reportId),
                _ => null
            };
        }

        private async Task<DetectedReport?> DetectRaidbotsAsync(string reportId)
        {
            try
            {
                var url = $"https://www.raidbots.com/simbot/report/{reportId}";
                using var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
                using var res = await _http.SendAsync(req);
                if (!res.IsSuccessStatusCode) return null;
                var html = await res.Content.ReadAsStringAsync();

                var titleMatch = Regex.Match(html, @"<title>(.*?)</title>", RegexOptions.Singleline);
                if (!titleMatch.Success) return null;
                var title = System.Net.WebUtility.HtmlDecode(titleMatch.Groups[1].Value.Trim());

                // format observed: "Droptimizer • Season 2 Raids • Heroic • Hero 6/6 - Rhagshaman - 126,618 DPS - Raidbots"
                var parts = title.Split(" - ");
                if (parts.Length < 2) return null;
                var characterName = parts[1].Trim();

                var diffMatch = Regex.Match(parts[0], @"\b(Normal|Heroic|Mythic)\b", RegexOptions.IgnoreCase);
                var difficulty = diffMatch.Success ? diffMatch.Value.ToLowerInvariant() : null;

                return new DetectedReport(ReportSource.Raidbots, reportId, characterName, null, null, null, difficulty);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to detect raidbots report {ReportId}", reportId);
                return null;
            }
        }

        private async Task<DetectedReport?> DetectQuestionablyEpicAsync(string reportId)
        {
            try
            {
                var url = $"https://questionablyepic.com/api/getUpgradeReport.php?reportID={Uri.EscapeDataString(reportId)}";
                using var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
                using var res = await _http.SendAsync(req);
                if (!res.IsSuccessStatusCode) return null;
                var raw = await res.Content.ReadAsStringAsync();

                // the endpoint double-encodes: the HTTP body is itself a JSON string literal containing the real JSON
                var inner = JsonSerializer.Deserialize<string>(raw);
                if (string.IsNullOrEmpty(inner)) return null;
                using var doc = JsonDocument.Parse(inner);

                var name = doc.RootElement.TryGetProperty("playername", out var pn) ? pn.GetString() : null;
                if (string.IsNullOrEmpty(name)) return null;
                var realm = doc.RootElement.TryGetProperty("realm", out var rl) ? rl.GetString() : null;
                var region = doc.RootElement.TryGetProperty("region", out var rg) ? rg.GetString() : null;
                var spec = doc.RootElement.TryGetProperty("spec", out var sp) ? sp.GetString() : null;

                return new DetectedReport(ReportSource.QuestionablyEpic, reportId, name, realm, region, spec, null);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to detect QuestionablyEpic report {ReportId}", reportId);
                return null;
            }
        }
    }
}
