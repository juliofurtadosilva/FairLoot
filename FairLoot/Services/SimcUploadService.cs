using System.Text.Json;
using FairLoot.Data;
using FairLoot.Domain;
using FairLoot.DTOs;
using Microsoft.EntityFrameworkCore;

namespace FairLoot.Services
{
    /// <summary>
    /// Shared "detect character from a raidbots/QE link, upload to wowaudit, audit-log it" flow — used by
    /// both the FairLoot UI (admin panel) and the Discord bot endpoint.
    /// </summary>
    public class SimcUploadService
    {
        private readonly AppDbContext _context;
        private readonly WowAuditService _wow;
        private readonly ReportLinkService _reportLink;
        private readonly ILogger<SimcUploadService> _logger;

        public SimcUploadService(AppDbContext context, WowAuditService wow, ReportLinkService reportLink, ILogger<SimcUploadService> logger)
        {
            _context = context;
            _wow = wow;
            _reportLink = reportLink;
            _logger = logger;
        }

        public async Task<SubmitReportResultDto> UploadAsync(Guild guild, string url, string submittedBy, Guid? userId)
        {
            var apiKey = guild.WowauditApiKey;
            if (string.IsNullOrEmpty(apiKey))
                return new SubmitReportResultDto { Success = false, Error = "Wowaudit API Key não configurada para esta guild." };

            if (string.IsNullOrWhiteSpace(url))
                return new SubmitReportResultDto { Success = false, Error = "URL do relatório é obrigatória." };

            var detected = await _reportLink.DetectAsync(url);
            if (detected == null)
                return new SubmitReportResultDto { Success = false, Error = "Não reconheci esse link (raidbots.com ou questionablyepic.com)." };

            if (string.IsNullOrEmpty(detected.CharacterName))
                return new SubmitReportResultDto { Success = false, Error = "Não consegui identificar o personagem desse relatório." };

            SubmitReportResultDto result;
            try
            {
                var (success, body) = await _wow.SubmitDroptimizerReportAsync(apiKey, detected.ReportId, detected.CharacterName);
                if (!success)
                {
                    string wowauditError = body;
                    try
                    {
                        using var doc = JsonDocument.Parse(body);
                        if (doc.RootElement.TryGetProperty("error", out var errProp) && errProp.ValueKind == JsonValueKind.String)
                            wowauditError = errProp.GetString() ?? body;
                    }
                    catch (JsonException) { /* keep raw body */ }

                    result = new SubmitReportResultDto { Success = false, Error = $"Wowaudit recusou o envio: {wowauditError}", CharacterName = detected.CharacterName, Difficulty = detected.Difficulty };
                }
                else
                {
                    result = new SubmitReportResultDto
                    {
                        Success = true,
                        CharacterName = detected.CharacterName,
                        Realm = detected.Realm,
                        Spec = detected.Spec,
                        Source = detected.Source.ToString(),
                        ReportId = detected.ReportId,
                        Difficulty = detected.Difficulty
                    };
                }
            }
            catch (HttpRequestException ex)
            {
                _logger.LogWarning(ex, "wowaudit report upload failed for guild {GuildId}", guild.Id);
                result = new SubmitReportResultDto { Success = false, Error = "Falha ao contatar o wowaudit.", CharacterName = detected.CharacterName, Difficulty = detected.Difficulty };
            }

            _context.SimcUploadLogs.Add(new SimcUploadLog
            {
                Id = Guid.NewGuid(),
                GuildId = guild.Id,
                UserId = userId,
                SubmittedBy = submittedBy,
                CharacterName = detected.CharacterName,
                Realm = detected.Realm,
                Spec = detected.Spec,
                Source = detected.Source.ToString(),
                ReportId = detected.ReportId,
                Difficulty = detected.Difficulty,
                Success = result.Success,
                ErrorMessage = result.Error
            });
            await _context.SaveChangesAsync();

            return result;
        }
    }
}
