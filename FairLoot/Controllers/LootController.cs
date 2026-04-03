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

        // map difficulty string to award multiplier
        private static double AwardForDifficulty(string difficulty)
        {
            if (string.IsNullOrEmpty(difficulty)) return 1.0;
            switch (difficulty.Trim().ToLowerInvariant())
            {
                case "normal": return 0.5;
                case "heroic": return 1.0;
                case "mythic": return 1.5;
                default: return 1.0;
            }
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
            var (user, error) = await GetAuthenticatedAdminAsync(_context);
            if (error != null) return error;

            var drop = await _context.LootDrops.FirstOrDefaultAsync(d => d.Id == id && d.GuildId == user!.GuildId && !d.IsReverted);
            if (drop == null) return NotFound();

            double revertedScore = 0;

            // revert award from character
            if (!string.IsNullOrEmpty(drop.AssignedTo))
            {
                var ch = await _context.Characters.FirstOrDefaultAsync(c => c.GuildId == user!.GuildId && c.Name == drop.AssignedTo);
                if (ch != null)
                {
                    revertedScore = drop.AwardValue;
                    ch.Score = Math.Max(0, ch.Score - drop.AwardValue);
                }
            }

            drop.IsReverted = true;
            drop.RevertedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            return Ok(new
            {
                drop.Id,
                drop.ItemName,
                drop.ItemId,
                drop.Boss,
                drop.Difficulty,
                drop.AssignedTo,
                revertedScore
            });
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
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            // load recent loot history (last 30 days) for loot count fairness
            var recentCutoff = DateTime.UtcNow.AddDays(-30);
            var recentLoot = await _context.LootDrops
                .Where(d => d.GuildId == user!.GuildId && d.CreatedAt >= recentCutoff && d.AssignedTo != "" && !d.IsReverted)
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

                // for each character in summary, find item percentage (respect optional difficulty filter)
                foreach (var ch in summary)
                {
                    double bestItemPerc = 0;
                    if (ch.Difficulties != null)
                    {
                        foreach (var d in ch.Difficulties)
                        {
                            // if caller provided a difficulty, only consider that difficulty
                            if (!string.IsNullOrEmpty(item.Difficulty) && !string.Equals(d.Difficulty, item.Difficulty, StringComparison.OrdinalIgnoreCase)) continue;
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
                    var isNew = dbChars.TryGetValue(ch.Name, out var charNew) && charNew.IsNewPlayer;

                    resp.Candidates.Add(new SuggestionCandidate
                    {
                        CharacterName = ch.Name,
                        Class = ch.Class,
                        ItemPercentage = bestItemPerc,
                        OverallScore = overall,
                        LootReceivedCount = lootCount,
                        LastLootDate = lastLoot,
                        IsNewPlayer = isNew
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

                    // new player penalty: reduce priority by 50%
                    if (c.IsNewPlayer) c.Priority *= 0.5;
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
                    .ToList();
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
                // single upgrade items (only 1 candidate wanted) get award 0 (no competition)
                var isTransmog = string.IsNullOrEmpty(alloc.AssignedTo);
                // award depends on difficulty: normal=0.5, heroic=1.0, mythic=1.5
                double award = 0;
                if (!isTransmog && !alloc.IsSingleUpgrade)
                {
                    award = AwardForDifficulty(alloc.Difficulty);
                }

                var drop = new Domain.LootDrop
                {
                    GuildId = user!.GuildId,
                    Boss = alloc.Boss,
                    Difficulty = alloc.Difficulty,
                    ItemId = alloc.ItemId,
                    ItemName = alloc.ItemName,
                    AssignedTo = alloc.AssignedTo,
                    CreatedAt = DateTime.UtcNow,
                    AwardValue = award,
                    Note = alloc.Note
                };

                drops.Add(drop);
                _context.LootDrops.Add(drop);

                // update character score in DB (add award)
                if (!isTransmog && !string.IsNullOrEmpty(alloc.AssignedTo))
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

        // POST api/loot/recalculate-scores
        // Admin endpoint to recompute all character scores from loot history using current award multipliers
        [HttpPost("recalculate-scores")]
        public async Task<IActionResult> RecalculateScores()
        {
            var (user, error) = await GetAuthenticatedAdminAsync(_context);
            if (error != null) return error;

            // reset all character scores to 0 for this guild
            var chars = await _context.Characters.Where(c => c.GuildId == user!.GuildId).ToListAsync();
            foreach (var c in chars) c.Score = 0;

            // consider all non-reverted loot drops for this guild
            var drops = await _context.LootDrops
                .Where(d => d.GuildId == user.GuildId && !d.IsReverted && !string.IsNullOrEmpty(d.AssignedTo))
                .ToListAsync();

            // use stored AwardValue on each drop so single-upgrade/transmog entries (which have AwardValue=0)
            // are respected instead of recomputing from Difficulty
            foreach (var d in drops)
            {
                // if the drop has a positive award (was counted previously), update its AwardValue
                // to reflect the new difficulty multipliers
                if (d.AwardValue > 0)
                {
                    d.AwardValue = AwardForDifficulty(d.Difficulty);
                }
                var award = d.AwardValue;
                var ch = chars.FirstOrDefault(c => string.Equals(c.Name, d.AssignedTo, StringComparison.OrdinalIgnoreCase));
                if (ch != null)
                {
                    ch.Score += award;
                }
            }

            await _context.SaveChangesAsync();
            return Ok(new { recalculated = chars.Count, dropsConsidered = drops.Count });
        }

        // POST api/loot/icons — resolve item icon URLs (no auth required)
        [HttpPost("icons")]
        [AllowAnonymous]
        public async Task<IActionResult> ResolveIcons([FromBody] List<int> itemIds)
        {
            var result = new Dictionary<int, string?>();
            foreach (var id in itemIds.Distinct().Take(100))
            {
                result[id] = await _wow.GetWowheadIconAsync(id);
            }
            return Ok(result);
        }
    }
}
