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
        private readonly BlizzardService _blizzard;

        public LootController(AppDbContext context, WowAuditService wow, BlizzardService blizzard)
        {
            _context = context;
            _wow = wow;
            _blizzard = blizzard;
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
        public async Task<IActionResult> History([FromQuery] Guid? seasonId = null)
        {
            var (user, error) = await GetAuthenticatedUserWithGuildAsync(_context);
            if (error != null) return error;

            var query = _context.LootDrops
                .Where(d => d.GuildId == user!.GuildId);

            if (seasonId.HasValue)
            {
                var season = await _context.Seasons.FirstOrDefaultAsync(s => s.Id == seasonId.Value && s.GuildId == user!.GuildId);
                if (season != null)
                    query = query.Where(d => d.CreatedAt >= season.StartedAt && d.CreatedAt <= season.EndedAt);
            }
            else
            {
                // no seasonId = "current season" (this is what the frontend's default/"current" view calls).
                // Scope it to since the last finalized season's end, same as FinalizeSeason/Suggest — otherwise
                // this returns the guild's ENTIRE lifetime history, silently re-mixing archived seasons back in.
                var lastSeason = await _context.Seasons
                    .Where(s => s.GuildId == user!.GuildId)
                    .OrderByDescending(s => s.EndedAt)
                    .FirstOrDefaultAsync();
                if (lastSeason != null)
                    query = query.Where(d => d.CreatedAt > lastSeason.EndedAt);
            }

            var drops = await query
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

            // optional score decay for the β fairness factor: older loot counts for less,
            // so a long dry spell recovers priority instead of a season score staying flat forever.
            // computed on the fly from history (Character.Score itself stays the flat, undecayed total
            // for display/transparency and for recalculate-scores).
            var decayHalfLifeDays = user.Guild?.ScoreDecayHalfLifeDays ?? 0;
            var decayedScoreByChar = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
            if (decayHalfLifeDays > 0)
            {
                // scoped to the current season, same as Character.Score (which FinalizeSeason zeroes at
                // each season close) — decay only changes flat-sum vs time-weighted-sum, not the timeframe.
                var lastSeason = await _context.Seasons
                    .Where(s => s.GuildId == user!.GuildId)
                    .OrderByDescending(s => s.EndedAt)
                    .FirstOrDefaultAsync();
                var seasonStart = lastSeason?.EndedAt ?? DateTime.MinValue;

                var scoredDrops = await _context.LootDrops
                    .Where(d => d.GuildId == user!.GuildId && !d.IsReverted && d.AwardValue > 0 && d.AssignedTo != "" && d.CreatedAt >= seasonStart)
                    .ToListAsync();
                var now = DateTime.UtcNow;
                foreach (var d in scoredDrops)
                {
                    var daysAgo = Math.Max(0, (now - d.CreatedAt).TotalDays);
                    var decayed = d.AwardValue * Math.Pow(0.5, daysAgo / decayHalfLifeDays);
                    decayedScoreByChar[d.AssignedTo] = decayedScoreByChar.TryGetValue(d.AssignedTo, out var acc) ? acc + decayed : decayed;
                }
            }

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

                    var overall = decayHalfLifeDays > 0
                        ? (decayedScoreByChar.TryGetValue(ch.Name, out var decayedVal) ? decayedVal : 0)
                        : (dbChars.TryGetValue(ch.Name, out var charDb) ? charDb.Score : 0);
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

            // load all guild characters once to avoid one round-trip per allocation (N+1)
            var dbChars = (await _context.Characters
                .Where(c => c.GuildId == user!.GuildId)
                .ToListAsync())
                .GroupBy(c => c.Name)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            foreach (var alloc in req.Allocations)
            {
                // consistent award: 1.0 per item received (score = total items received)
                // transmog items (empty AssignedTo) get award 0
                // single upgrade items (only 1 candidate wanted) get award 0 (no competition)
                var isTransmog = string.IsNullOrEmpty(alloc.AssignedTo);
                // award depends on difficulty: normal=0.5, heroic=1.0, mythic=1.5
                double award = 0;
                if (!isTransmog && !alloc.IsSingleUpgrade && !alloc.IsManualAssignment)
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
                    Note = alloc.Note,
                    IsManualAssignment = alloc.IsManualAssignment
                };

                drops.Add(drop);
                _context.LootDrops.Add(drop);

                // update character score in DB (add award) — manual assignments never touch score
                if (!isTransmog && !alloc.IsManualAssignment && !string.IsNullOrEmpty(alloc.AssignedTo))
                {
                    if (dbChars.TryGetValue(alloc.AssignedTo, out var chDb))
                    {
                        chDb.Score += award;
                    }
                }
            }

            await _context.SaveChangesAsync();

            return Ok(new { distributed = drops.Count });
        }

        // POST api/loot/recalculate-scores?dryRun=true
        // Admin endpoint to recompute all character scores from loot history using current award multipliers.
        // With dryRun=true, computes the same result but does not save — returns a per-character diff instead.
        [HttpPost("recalculate-scores")]
        public async Task<IActionResult> RecalculateScores([FromQuery] bool dryRun = false)
        {
            var (user, error) = await GetAuthenticatedAdminAsync(_context);
            if (error != null) return error;

            var chars = await _context.Characters.Where(c => c.GuildId == user!.GuildId).ToListAsync();
            var oldScores = chars.ToDictionary(c => c.Id, c => c.Score);
            foreach (var c in chars) c.Score = 0;

            // consider all non-reverted loot drops for this guild
            var drops = await _context.LootDrops
                .Where(d => d.GuildId == user!.GuildId && !d.IsReverted && !string.IsNullOrEmpty(d.AssignedTo))
                .ToListAsync();

            // use stored AwardValue on each drop so single-upgrade/transmog/manual-assignment entries
            // (which have AwardValue=0) are respected instead of recomputing from Difficulty.
            // Manual-assignment drops always carry AwardValue=0 and are never recomputed here.
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

            if (dryRun)
            {
                // undo in-memory changes so nothing is persisted, then return the computed diff
                _context.ChangeTracker.Clear();
                var diffs = chars
                    .Select(c => new
                    {
                        characterName = c.Name,
                        oldScore = oldScores.TryGetValue(c.Id, out var old) ? old : 0,
                        newScore = c.Score,
                        delta = c.Score - (oldScores.TryGetValue(c.Id, out var old2) ? old2 : 0)
                    })
                    .Where(d => Math.Abs(d.delta) > 0.0001)
                    .OrderByDescending(d => Math.Abs(d.delta))
                    .ToList();
                return Ok(new { dryRun = true, dropsConsidered = drops.Count, diffs });
            }

            await _context.SaveChangesAsync();
            return Ok(new { recalculated = chars.Count, dropsConsidered = drops.Count });
        }

        // DELETE api/loot/{id}
        [HttpDelete("{id:guid}")]
        public async Task<IActionResult> Delete(Guid id)
        {
            var (user, error) = await GetAuthenticatedAdminAsync(_context);
            if (error != null) return error;

            var drop = await _context.LootDrops.FirstOrDefaultAsync(d => d.Id == id && d.GuildId == user!.GuildId && d.IsReverted);
            if (drop == null) return NotFound();

            _context.LootDrops.Remove(drop);
            await _context.SaveChangesAsync();
            return Ok(new { deleted = true });
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

        // POST api/loot/raid-image — resolve a raid's banner image. Tries Wowhead's curated guide art first
        // (matches what admins used to hand-pick), falls back to Blizzard's official journal tile.
        [HttpPost("raid-image")]
        [AllowAnonymous]
        public async Task<IActionResult> ResolveRaidImage([FromBody] RaidImageLookupRequest req)
        {
            if (string.IsNullOrWhiteSpace(req?.RaidName)) return Ok(new { url = (string?)null });

            var expansion = await _blizzard.ResolveRaidExpansionNameAsync(req.RaidName);
            if (expansion != null)
            {
                var guide = await _wow.GetWowheadRaidGuideAsync(req.RaidName, expansion);
                if (!string.IsNullOrEmpty(guide?.HeaderImageUrl))
                    return Ok(new { url = guide.HeaderImageUrl });
            }

            // raid overview guide not published yet (common for brand-new content) — try Wowhead's
            // site search, which often finds individual boss guides before the raid cheat-sheet exists.
            var searched = await _wow.SearchWowheadRaidGuideAsync(req.RaidName);
            if (!string.IsNullOrEmpty(searched?.ImageUrl))
                return Ok(new { url = searched.ImageUrl });

            var url = await _blizzard.ResolveRaidImageAsync(req.RaidName);
            return Ok(new { url });
        }

        // POST api/loot/boss-image — resolve a boss's portrait. Tries Wowhead's curated guide icon first
        // (matches what admins used to hand-pick via devtools), falls back to Blizzard's official 3D render.
        // RaidName is optional: when known (Loot control screen) it's a fast targeted lookup; when absent
        // (e.g. Loot History, which doesn't store which raid a drop came from) it searches every instance.
        [HttpPost("boss-image")]
        [AllowAnonymous]
        public async Task<IActionResult> ResolveBossImage([FromBody] BossImageLookupRequest req)
        {
            if (string.IsNullOrWhiteSpace(req?.BossName)) return Ok(new { url = (string?)null });

            if (!string.IsNullOrWhiteSpace(req.RaidName))
            {
                var expansion = await _blizzard.ResolveRaidExpansionNameAsync(req.RaidName);
                if (expansion != null)
                {
                    var guide = await _wow.GetWowheadRaidGuideAsync(req.RaidName, expansion);
                    if (guide != null && guide.BossIconByName.TryGetValue(req.BossName, out var icon))
                        return Ok(new { url = $"https://wow.zamimg.com/images/wow/icons/large/{icon}.jpg" });
                }
            }

            // raid overview guide didn't have this boss (often true for brand-new content) — try
            // Wowhead's site search directly for the boss, which is usually published earlier.
            var searched = await _wow.SearchWowheadRaidGuideAsync(req.BossName);
            if (!string.IsNullOrEmpty(searched?.ImageUrl))
                return Ok(new { url = searched.ImageUrl });

            var url = string.IsNullOrWhiteSpace(req.RaidName)
                ? await _blizzard.ResolveBossImageByNameAsync(req.BossName)
                : await _blizzard.ResolveBossImageAsync(req.RaidName, req.BossName);
            return Ok(new { url });
        }

        // POST api/loot/raid-name — resolve a raid's localized display name via Blizzard Journal API
        [HttpPost("raid-name")]
        [AllowAnonymous]
        public async Task<IActionResult> ResolveRaidName([FromBody] RaidNameLookupRequest req)
        {
            if (string.IsNullOrWhiteSpace(req?.RaidName) || string.IsNullOrWhiteSpace(req?.Locale))
                return Ok(new { name = (string?)null });
            var name = await _blizzard.ResolveRaidLocalizedNameAsync(req.RaidName, req.Locale);
            return Ok(new { name });
        }

        // POST api/loot/boss-name — resolve a boss's localized display name via Blizzard Journal API
        [HttpPost("boss-name")]
        [AllowAnonymous]
        public async Task<IActionResult> ResolveBossName([FromBody] BossNameLookupRequest req)
        {
            if (string.IsNullOrWhiteSpace(req?.BossName) || string.IsNullOrWhiteSpace(req?.Locale))
                return Ok(new { name = (string?)null });
            var name = await _blizzard.ResolveBossLocalizedNameAsync(req.RaidName, req.BossName, req.Locale);
            return Ok(new { name });
        }

        // POST api/loot/item-names — resolve localized item names (no auth required)
        [HttpPost("item-names")]
        [AllowAnonymous]
        public async Task<IActionResult> ResolveItemNames([FromBody] ItemNamesRequest req)
        {
            var result = new Dictionary<int, string?>();
            var locale = string.IsNullOrWhiteSpace(req?.Locale) ? "en_US" : req.Locale;
            var ids = (req?.Ids ?? new List<int>()).Distinct().Take(100);
            var tasks = ids.Select(async id => (id, name: await _wow.GetLocalizedItemNameAsync(id, locale)));
            var resolved = await Task.WhenAll(tasks);
            foreach (var (id, name) in resolved)
                result[id] = name;
            return Ok(result);
        }
    }
}
