using System.Security.Cryptography;
using System.Text;
using FairLoot.Data;
using FairLoot.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FairLoot.Controllers
{
    /// <summary>
    /// Entry point for the (single, shared) FairLoot Discord bot — any WoW guild can invite the same bot
    /// to their Discord server and link it by pasting their Discord server ID into their FairLoot admin
    /// settings. Authenticated by one global shared secret (proves the request came from our bot), then
    /// routed to the right FairLoot guild by the Discord server ID in the request.
    /// </summary>
    [Route("api/discord")]
    [AllowAnonymous]
    public class DiscordBotController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly SimcUploadService _simcUpload;
        private readonly WowAuditService _wow;
        private readonly IConfiguration _config;

        public DiscordBotController(AppDbContext context, SimcUploadService simcUpload, WowAuditService wow, IConfiguration config)
        {
            _context = context;
            _simcUpload = simcUpload;
            _wow = wow;
            _config = config;
        }

        // POST api/discord/upload-report
        [HttpPost("upload-report")]
        public async Task<IActionResult> UploadReport([FromBody] DTOs.DiscordUploadRequestDto request)
        {
            if (!IsValidSecret(request.SharedSecret))
                return Unauthorized(new DTOs.SubmitReportResultDto { Success = false, Error = "Segredo do bot inválido." });

            if (string.IsNullOrWhiteSpace(request.DiscordServerId))
                return BadRequest(new DTOs.SubmitReportResultDto { Success = false, Error = "ID do servidor Discord é obrigatório." });

            var guild = await _context.Guilds.FirstOrDefaultAsync(g => g.DiscordServerId == request.DiscordServerId);
            if (guild == null)
                return UnprocessableEntity(new DTOs.SubmitReportResultDto
                {
                    Success = false,
                    Error = "Esse servidor Discord ainda não está vinculado a uma guilda no FairLoot (configure o Discord Server ID no Admin)."
                });

            var submittedBy = !string.IsNullOrEmpty(request.DiscordUsername) ? $"@{request.DiscordUsername} (Discord)" : "Discord";
            var result = await _simcUpload.UploadAsync(guild, request.Url, submittedBy, null);
            return result.Success ? Ok(result) : UnprocessableEntity(result);
        }

        // GET api/discord/digest-schedule?sharedSecret=...&discordServerId=...
        // Cheap, DB-only check (no wowaudit call) — the bot polls this once a minute per guild to
        // know whether it's time to fire, without paying for the heavy wishlist fetch every time.
        [HttpGet("digest-schedule")]
        public async Task<IActionResult> DigestSchedule([FromQuery] string sharedSecret, [FromQuery] string discordServerId)
        {
            if (!IsValidSecret(sharedSecret)) return Unauthorized();
            if (string.IsNullOrWhiteSpace(discordServerId)) return BadRequest();

            var guild = await _context.Guilds
                .Where(g => g.DiscordServerId == discordServerId)
                .Select(g => new { g.DiscordDigestEnabled, g.DiscordDigestChannelId, g.DiscordDigestTime, g.DiscordDigestTimezone, g.DiscordDigestDaysOfWeek, g.DiscordDigestPendingManualTrigger })
                .FirstOrDefaultAsync();
            if (guild == null || !guild.DiscordDigestEnabled || string.IsNullOrEmpty(guild.DiscordDigestChannelId))
                return Ok(new { enabled = false });

            var time = string.IsNullOrEmpty(guild.DiscordDigestTime) ? "21:00" : guild.DiscordDigestTime;
            var timezone = string.IsNullOrEmpty(guild.DiscordDigestTimezone) ? "America/Sao_Paulo" : guild.DiscordDigestTimezone;
            // an existing guild that never touched this field has '' from the migration's DB default
            // (not the C# default) — treat that the same as "every day" so nobody's working digest
            // silently stops firing after this deploy.
            var daysOfWeek = string.IsNullOrEmpty(guild.DiscordDigestDaysOfWeek) ? "0,1,2,3,4,5,6" : guild.DiscordDigestDaysOfWeek;
            return Ok(new { enabled = true, time, timezone, daysOfWeek, manualTrigger = guild.DiscordDigestPendingManualTrigger });
        }

        // POST api/discord/digest-trigger/consume?sharedSecret=...&discordServerId=...
        // Called by the bot right after it successfully posts a manually-triggered digest, so the
        // "send now" button fires exactly once instead of re-triggering every minute until midnight.
        [HttpPost("digest-trigger/consume")]
        public async Task<IActionResult> ConsumeDigestTrigger([FromQuery] string sharedSecret, [FromQuery] string discordServerId)
        {
            if (!IsValidSecret(sharedSecret)) return Unauthorized();
            if (string.IsNullOrWhiteSpace(discordServerId)) return BadRequest();

            var guild = await _context.Guilds.FirstOrDefaultAsync(g => g.DiscordServerId == discordServerId);
            if (guild == null) return NotFound();

            guild.DiscordDigestPendingManualTrigger = false;
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // GET api/discord/outdated-digest?sharedSecret=...&discordServerId=...
        // The heavy version — actually fetches wowaudit's wishlist and computes who's outdated. Called
        // by the bot only once it already knows (via digest-schedule) that it's actually time to post.
        [HttpGet("outdated-digest")]
        public async Task<IActionResult> OutdatedDigest([FromQuery] string sharedSecret, [FromQuery] string discordServerId)
        {
            if (!IsValidSecret(sharedSecret)) return Unauthorized();
            if (string.IsNullOrWhiteSpace(discordServerId)) return BadRequest();

            var guild = await _context.Guilds.FirstOrDefaultAsync(g => g.DiscordServerId == discordServerId);
            if (guild == null || !guild.DiscordDigestEnabled || string.IsNullOrEmpty(guild.DiscordDigestChannelId))
                return Ok(new { enabled = false });

            if (string.IsNullOrEmpty(guild.WowauditApiKey))
                return Ok(new { enabled = false });

            var allowedDiffs = (string.IsNullOrEmpty(guild.DiscordDigestDifficulties) ? "heroic,mythic" : guild.DiscordDigestDifficulties)
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(d => d.ToLowerInvariant())
                .ToHashSet();

            var summary = await _wow.GetGuildWishlistSummaryAsync(guild.WowauditApiKey);

            var players = new List<object>();
            foreach (var ch in summary)
            {
                var outdatedDiffs = new SortedSet<string>(Comparer<string>.Create((a, b) =>
                    // stable, meaningful display order regardless of dictionary/hashset iteration order
                    Array.IndexOf(new[] { "normal", "heroic", "mythic" }, a).CompareTo(Array.IndexOf(new[] { "normal", "heroic", "mythic" }, b))));

                foreach (var inst in ch.Instances)
                {
                    foreach (var diff in inst.Difficulties)
                    {
                        var diffKey = diff.Difficulty.ToLowerInvariant();
                        if (!allowedDiffs.Contains(diffKey)) continue;
                        var hasOutdatedItem = diff.Encounters.Any(e => e.Items.Any(i => i.Outdated));
                        if (hasOutdatedItem) outdatedDiffs.Add(diffKey);
                    }
                }

                if (outdatedDiffs.Count > 0)
                    players.Add(new { name = ch.Name, difficulties = outdatedDiffs.ToList() });
            }

            return Ok(new
            {
                enabled = true,
                guildName = guild.Name,
                channelId = guild.DiscordDigestChannelId,
                roleId = guild.DiscordDigestRoleId,
                players
            });
        }

        private bool IsValidSecret(string? provided)
        {
            var expectedSecret = _config["Discord:BotSharedSecret"];
            return !string.IsNullOrEmpty(expectedSecret) && FixedTimeEquals(provided ?? string.Empty, expectedSecret);
        }

        private static bool FixedTimeEquals(string a, string b)
        {
            var aBytes = Encoding.UTF8.GetBytes(a);
            var bBytes = Encoding.UTF8.GetBytes(b);
            // CryptographicOperations.FixedTimeEquals requires equal-length spans; pad the shorter one so
            // length itself doesn't leak via early-exit timing, then still fail if lengths differ.
            if (aBytes.Length != bBytes.Length) return false;
            return CryptographicOperations.FixedTimeEquals(aBytes, bBytes);
        }
    }
}
