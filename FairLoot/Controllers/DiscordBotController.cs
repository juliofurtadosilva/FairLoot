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
        private readonly IConfiguration _config;

        public DiscordBotController(AppDbContext context, SimcUploadService simcUpload, IConfiguration config)
        {
            _context = context;
            _simcUpload = simcUpload;
            _config = config;
        }

        // POST api/discord/upload-report
        [HttpPost("upload-report")]
        public async Task<IActionResult> UploadReport([FromBody] DTOs.DiscordUploadRequestDto request)
        {
            var expectedSecret = _config["Discord:BotSharedSecret"];
            if (string.IsNullOrEmpty(expectedSecret) || !FixedTimeEquals(request.SharedSecret, expectedSecret))
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
