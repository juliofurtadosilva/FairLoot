using FairLoot.Data;
using FairLoot.DTOs;
using FairLoot.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FairLoot.Controllers
{
    [Route("api/[controller]")]
    [Authorize]
    public class LootController : BaseApiController
    {
        private readonly AppDbContext _context;
        private readonly WowAuditService _wow;

        public LootController(AppDbContext context, WowAuditService wow)
        {
            _context = context;
            _wow = wow;
        }

        // GET api/loot/history
        [HttpGet("history")]
        public async Task<IActionResult> History()
        {
            var (user, error) = await GetAuthenticatedUserWithGuildAsync(_context);
            if (error != null) return error;

            var drops = await _context.LootDrops
                .Where(d => d.GuildId == user!.GuildId)
                .OrderByDescending(d => d.CreatedAt)
                .ToListAsync();
            return Ok(drops);
        }

        // POST api/loot/undo/{id}
        [HttpPost("undo/{id:guid}")]
        public async Task<IActionResult> Undo(Guid id)
        {
            var (user, error) = await GetAuthenticatedUserWithGuildAsync(_context);
            if (error != null) return error;

            var drop = await _context.LootDrops.FirstOrDefaultAsync(d => d.Id == id && d.GuildId == user!.GuildId);
            if (drop == null) return NotFound();

            // revert award from character
            if (!string.IsNullOrEmpty(drop.AssignedTo))
            {
                var ch = await _context.Characters.FirstOrDefaultAsync(c => c.GuildId == user!.GuildId && c.Name == drop.AssignedTo);
                if (ch != null)
                {
                    ch.Score = Math.Max(0, ch.Score - drop.AwardValue);
                }
            }

            _context.LootDrops.Remove(drop);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // POST api/loot/suggest
        [HttpPost("suggest")]
        public async Task<IActionResult> Suggest([FromBody] SuggestItemRequest req)
        {
            var (user, error) = await GetAuthenticatedUserWithGuildAsync(_context);
            if (error != null) return error;

            var apiKey = user!.Guild!.WowauditApiKey;
            if (string.IsNullOrEmpty(apiKey)) return BadRequest("Wowaudit API key não configurada para esta guild.");

            var summary = await _wow.GetGuildWishlistSummaryAsync(apiKey);

            // load all guild characters once to avoid N+1 queries
            var dbChars = (await _context.Characters
                .Where(c => c.GuildId == user!.GuildId)
                .ToListAsync())
                .GroupBy(c => c.Name)
                .ToDictionary(g => g.Key, g => g.First());

            // load recent loot history (last 30 days) for loot count fairness
            var recentCutoff = DateTime.UtcNow.AddDays(-30);
            var recentLoot = await _context.LootDrops
                .Where(d => d.GuildId == user!.GuildId && d.CreatedAt >= recentCutoff && d.AssignedTo != "")
                .ToListAsync();
            var lootCountByChar = recentLoot
                .GroupBy(d => d.AssignedTo)
                .ToDictionary(g => g.Key, g => g.Count());
            var lastLootByChar = recentLoot
                .GroupBy(d => d.AssignedTo)
                .ToDictionary(g => g.Key, g => g.Max(d => d.CreatedAt));

            var responses = new List<SuggestionResponse>();

            foreach (var item in req.Items)
            {
                var resp = new SuggestionResponse { Item = item };

                // for each character in summary, find item percentage
                foreach (var ch in summary)
                {
                    double bestItemPerc = 0;
                    if (ch.Difficulties != null)
                    {
                        foreach (var d in ch.Difficulties)
                        {
                            if (d.Encounters == null) continue;
                            foreach (var e in d.Encounters)
                            {
                                if (e.Items == null) continue;
                                foreach (var it in e.Items)
                                {
                                    if (item.ItemId != null && it.Id != null && item.ItemId == it.Id)
                                    {
                                        if (it.Percentage > bestItemPerc) bestItemPerc = it.Percentage;
                                    }
                                    else if (!string.IsNullOrEmpty(item.ItemName) && string.Equals(item.ItemName, it.Name, StringComparison.OrdinalIgnoreCase))
                                    {
                                        if (it.Percentage > bestItemPerc) bestItemPerc = it.Percentage;
                                    }
                                }
                            }
                        }
                    }

                    var overall = dbChars.TryGetValue(ch.Name, out var charDb) ? charDb.Score : 0;
                    var lootCount = lootCountByChar.TryGetValue(ch.Name, out var lc) ? lc : 0;
                    var lastLoot = lastLootByChar.TryGetValue(ch.Name, out var ll) ? (DateTime?)ll : null;

                    resp.Candidates.Add(new SuggestionCandidate
                    {
                        CharacterName = ch.Name,
                        Class = ch.Class,
                        ItemPercentage = bestItemPerc,
                        OverallScore = overall,
                        LootReceivedCount = lootCount,
                        LastLootDate = lastLoot
                    });
                }

                // three-factor priority: α × upgradeNorm + β × fairnessNorm + γ × lootCountNorm
                var alpha = user.Guild?.PriorityAlpha ?? 0.4;
                var beta = user.Guild?.PriorityBeta ?? 0.3;
                var gamma = user.Guild?.PriorityGamma ?? 0.3;

                var maxItem = resp.Candidates.Select(c => c.ItemPercentage).DefaultIfEmpty(0).Max();
                var minScore = resp.Candidates.Select(c => c.OverallScore).DefaultIfEmpty(0).Min();
                var maxScore = resp.Candidates.Select(c => c.OverallScore).DefaultIfEmpty(0).Max();
                var scoreRange = maxScore - minScore;
                var maxLootCount = resp.Candidates.Select(c => c.LootReceivedCount).DefaultIfEmpty(0).Max();
                var minLootCount = resp.Candidates.Select(c => c.LootReceivedCount).DefaultIfEmpty(0).Min();
                var lootCountRange = maxLootCount - minLootCount;

                foreach (var c in resp.Candidates)
                {
                    // upgrade component: normalize by max so best upgrade = 1.0
                    var upgradeNorm = (maxItem > 0) ? (c.ItemPercentage / maxItem) : 0;

                    // fairness component: min-max normalization, inverted (lower score = higher fairness)
                    // when all scores are equal (range=0), everyone gets fairness=1.0 (equally fair)
                    var fairnessNorm = (scoreRange > 0)
                        ? (maxScore - c.OverallScore) / scoreRange
                        : 1.0;

                    // loot count component: inverted (fewer items received recently = higher priority)
                    // when all counts are equal (range=0), everyone gets lootCountNorm=1.0
                    var lootCountNorm = (lootCountRange > 0)
                        ? (double)(maxLootCount - c.LootReceivedCount) / lootCountRange
                        : 1.0;

                    c.Priority = alpha * upgradeNorm + beta * fairnessNorm + gamma * lootCountNorm;
                }

                var positiveCount = resp.Candidates.Count(c => c.ItemPercentage > 0);
                resp.AllZeroUpgrade = positiveCount == 0;
                resp.SingleUpgradeOnly = positiveCount == 1;

                // order by priority desc; tie-break: higher upgrade first, then lower score, then oldest loot
                resp.Candidates = resp.Candidates
                    .OrderByDescending(c => c.Priority)
                    .ThenByDescending(c => c.ItemPercentage)
                    .ThenBy(c => c.OverallScore)
                    .ThenBy(c => c.LastLootDate ?? DateTime.MinValue)
                    .Take(5).ToList();
                responses.Add(resp);
            }

            return Ok(responses);
        }

        // POST api/loot/distribute
        [HttpPost("distribute")]
        public async Task<IActionResult> Distribute([FromBody] DistributeRequest req)
        {
            var (user, error) = await GetAuthenticatedUserWithGuildAsync(_context);
            if (error != null) return error;

            var drops = new List<Domain.LootDrop>();

            foreach (var alloc in req.Allocations)
            {
                // consistent award: 1.0 per item received (score = total items received)
                // transmog items (empty AssignedTo) get award 0
                var isTransmog = string.IsNullOrEmpty(alloc.AssignedTo);
                double award = isTransmog ? 0 : 1.0;

                var drop = new Domain.LootDrop
                {
                    GuildId = user!.GuildId,
                    Boss = alloc.Boss,
                    Difficulty = alloc.Difficulty,
                    ItemId = alloc.ItemId,
                    ItemName = alloc.ItemName,
                    AssignedTo = alloc.AssignedTo,
                    CreatedAt = DateTime.UtcNow,
                    AwardValue = award
                };

                drops.Add(drop);
                _context.LootDrops.Add(drop);

                // update character score in DB (add award)
                if (!isTransmog)
                {
                    var chDb = await _context.Characters.FirstOrDefaultAsync(c => c.GuildId == user.GuildId && c.Name == alloc.AssignedTo);
                    if (chDb != null)
                    {
                        chDb.Score += award;
                    }
                }
            }

            await _context.SaveChangesAsync();

            return Ok(new { distributed = drops.Count });
        }
    }
}
