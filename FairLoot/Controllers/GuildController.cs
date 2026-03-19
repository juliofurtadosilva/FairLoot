using System.Text.Json;
using FairLoot.Data;
using FairLoot.Domain;
using FairLoot.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FairLoot.Controllers
{
    [Route("api/[controller]")]
    [Authorize]
    public class GuildController : BaseApiController
    {
        private readonly AppDbContext _context;
        private readonly WowAuditService _wow;

        public GuildController(AppDbContext context, WowAuditService wow)
        {
            _context = context;
            _wow = wow;
        }

        // GET api/guild/members/pending
        [HttpGet("members/pending")]
        public async Task<IActionResult> GetPendingMembers()
        {
            var (admin, error) = await GetAuthenticatedAdminAsync(_context);
            if (error != null) return error;

            var pending = await _context.Users
                .Where(u => u.GuildId == admin!.GuildId && !u.IsApproved)
                .Select(u => new { u.Id, u.Email, u.BattleTag, u.CharacterName, u.CreatedAt })
                .ToListAsync();

            return Ok(pending);
        }

        // POST api/guild/members/{userId}/approve
        [HttpPost("members/{userId:guid}/approve")]
        public async Task<IActionResult> ApproveMember(Guid userId)
        {
            var (admin, error) = await GetAuthenticatedAdminAsync(_context);
            if (error != null) return error;

            var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId && u.GuildId == admin!.GuildId);
            if (user == null)
                return NotFound();

            user.IsApproved = true;
            await _context.SaveChangesAsync();

            try
            {
                var apiKey = admin!.Guild?.WowauditApiKey;
                if (!string.IsNullOrEmpty(apiKey))
                    await _wow.SyncGuildCharactersAsync(_context, admin.GuildId, apiKey);
            }
            catch
            {
                // ignore sync errors
            }
            return NoContent();
        }

        // GET api/guild
        [HttpGet]
        public async Task<IActionResult> GetMyGuild()
        {
            var (user, error) = await GetAuthenticatedUserWithGuildAsync(_context);
            if (error != null) return error;

            return Ok(user!.Guild);
        }

        // GET api/guild/wowaudit/characters
        [HttpGet("wowaudit/characters")]
        public async Task<IActionResult> GetWowAuditCharacters()
        {
            var (user, error) = await GetAuthenticatedUserWithGuildAsync(_context);
            if (error != null) return error;

            var apiKey = user!.Guild!.WowauditApiKey;
            if (string.IsNullOrEmpty(apiKey))
                return BadRequest("Wowaudit API key não configurada para esta guild.");

            var chars = await _wow.GetGuildCharactersAsync(apiKey);
            return Ok(new { characters = chars });
        }

        // POST api/guild/sync-characters
        [HttpPost("sync-characters")]
        public async Task<IActionResult> SyncCharacters()
        {
            var (user, error) = await GetAuthenticatedUserWithGuildAsync(_context);
            if (error != null) return error;

            var apiKey = user!.Guild!.WowauditApiKey;
            if (string.IsNullOrEmpty(apiKey))
                return BadRequest("Wowaudit API key não configurada para esta guild.");

            var upserts = await _wow.SyncGuildCharactersAsync(_context, user.GuildId, apiKey);
            return Ok(new { upserted = upserts });
        }

        // GET api/guild/characters (from DB)
        [HttpGet("characters")]
        public async Task<IActionResult> GetCharactersFromDb()
        {
            var (user, error) = await GetAuthenticatedUserWithGuildAsync(_context, requireApproval: false);
            if (error != null) return error;

            var chars = await _context.Characters
                .Where(c => c.GuildId == user!.GuildId && c.IsActive)
                .Select(c => new { c.Id, c.Name, c.Realm, c.Class, c.Score, c.IsNewPlayer })
                .ToListAsync();
            return Ok(chars);
        }

        // POST api/guild/characters/{charId}/toggle-new
        [HttpPost("characters/{charId:guid}/toggle-new")]
        public async Task<IActionResult> ToggleNewPlayer(Guid charId)
        {
            var (user, error) = await GetAuthenticatedAdminAsync(_context);
            if (error != null) return error;

            var ch = await _context.Characters.FirstOrDefaultAsync(c => c.Id == charId && c.GuildId == user!.GuildId);
            if (ch == null) return NotFound();

            ch.IsNewPlayer = !ch.IsNewPlayer;
            await _context.SaveChangesAsync();
            return Ok(new { ch.Id, ch.IsNewPlayer });
        }

        [HttpGet("wowaudit/wishlists")]
        public async Task<IActionResult> GetWowAuditWishlist([FromQuery] bool force = false)
        {
            var (user, error) = await GetAuthenticatedUserWithGuildAsync(_context);
            if (error != null) return error;

            var apiKey = user!.Guild!.WowauditApiKey;
            if (string.IsNullOrEmpty(apiKey))
                return BadRequest("Wowaudit API key não configurada para esta guild.");

            var summary = await _wow.GetGuildWishlistSummaryAsync(apiKey, force);

            // if WowAudit returned data, save to DB cache for future cold starts
            if (summary.Count > 0)
            {
                var cached = await _context.WishlistCaches.FirstOrDefaultAsync(w => w.GuildId == user.GuildId);
                var jsonData = JsonSerializer.Serialize(summary);
                if (cached == null)
                {
                    _context.WishlistCaches.Add(new WishlistCache
                    {
                        GuildId = user.GuildId,
                        DataJson = jsonData,
                        UpdatedAt = DateTime.UtcNow
                    });
                }
                else
                {
                    cached.DataJson = jsonData;
                    cached.UpdatedAt = DateTime.UtcNow;
                }
                await _context.SaveChangesAsync();
            }
            else
            {
                // WowAudit failed or returned empty — try DB cache
                var cached = await _context.WishlistCaches.FirstOrDefaultAsync(w => w.GuildId == user.GuildId);
                if (cached != null && !string.IsNullOrEmpty(cached.DataJson))
                {
                    var restored = JsonSerializer.Deserialize<List<DTOs.CharacterWishlistSummary>>(cached.DataJson);
                    if (restored != null && restored.Count > 0)
                        summary = restored;
                }
            }

            // enrich class from DB characters (the characters endpoint has reliable class data)
            var dbClasses = (await _context.Characters
                .Where(c => c.GuildId == user.GuildId && c.Class != null && c.Class != "")
                .ToListAsync())
                .GroupBy(c => c.Name)
                .ToDictionary(g => g.Key, g => g.First().Class!);

            foreach (var ch in summary)
            {
                if (string.IsNullOrEmpty(ch.Class) && dbClasses.TryGetValue(ch.Name, out var cls))
                    ch.Class = cls;
            }

            return Ok(new { summary });
        }

        // PUT api/guild
        [HttpPut]
        public async Task<IActionResult> UpdateGuild([FromBody] FairLoot.DTOs.GuildUpdateDto updatedGuild)
        {
            var (user, error) = await GetAuthenticatedAdminAsync(_context);
            if (error != null) return error;

            if (!string.IsNullOrEmpty(updatedGuild.Name)) user!.Guild!.Name = updatedGuild.Name;
            if (!string.IsNullOrEmpty(updatedGuild.Server)) user!.Guild!.Server = updatedGuild.Server;
            if (updatedGuild.WowauditApiKey != null) user!.Guild!.WowauditApiKey = updatedGuild.WowauditApiKey;
            if (updatedGuild.PriorityAlpha.HasValue && updatedGuild.PriorityAlpha.Value >= 0 && updatedGuild.PriorityAlpha.Value <= 1)
                user!.Guild!.PriorityAlpha = updatedGuild.PriorityAlpha.Value;
            if (updatedGuild.PriorityBeta.HasValue && updatedGuild.PriorityBeta.Value >= 0 && updatedGuild.PriorityBeta.Value <= 1)
                user!.Guild!.PriorityBeta = updatedGuild.PriorityBeta.Value;
            if (updatedGuild.PriorityGamma.HasValue && updatedGuild.PriorityGamma.Value >= 0 && updatedGuild.PriorityGamma.Value <= 1)
                user!.Guild!.PriorityGamma = updatedGuild.PriorityGamma.Value;
            if (updatedGuild.MinIlevelNormal.HasValue)
                user!.Guild!.MinIlevelNormal = updatedGuild.MinIlevelNormal.Value;
            if (updatedGuild.MinIlevelHeroic.HasValue)
                user!.Guild!.MinIlevelHeroic = updatedGuild.MinIlevelHeroic.Value;
            if (updatedGuild.MinIlevelMythic.HasValue)
                user!.Guild!.MinIlevelMythic = updatedGuild.MinIlevelMythic.Value;

            await _context.SaveChangesAsync();
            return Ok(user!.Guild);
        }

        // DELETE api/guild
        [HttpDelete]
        public async Task<IActionResult> DeleteGuild()
        {
            var (user, error) = await GetAuthenticatedAdminAsync(_context);
            if (error != null) return error;

            _context.Guilds.Remove(user!.Guild!);
            await _context.SaveChangesAsync();
            return NoContent();
        }
    }
}