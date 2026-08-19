namespace FairLoot.Domain
{
    public class Guild
    {
        public Guid Id { get; set; }
        public required string Name { get; set; }
        public required string Server { get; set; }
        // Blizzard realm slug (e.g. "azralon", "area-52")
        public string? RealmSlug { get; set; }
        // Blizzard region (us, eu, kr, tw)
        public string? Region { get; set; }
        // optional API key for external wowaudit access (per-guild)
        public string? WowauditApiKey { get; set; }
        // Discord server (guild) snowflake ID — links this FairLoot guild to a Discord server so the
        // single, shared FairLoot Discord bot (see discord-bot/) knows which guild a /simc command came
        // from. Not a secret — Discord server IDs are effectively public.
        public string? DiscordServerId { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public List<User> Members { get; set; } = new List<User>();
        // characters synced from WowAudit
        public List<Character> Characters { get; set; } = new List<Character>();
        // weight for item upgrade percentage component (0..1).
        public double PriorityAlpha { get; set; } = 0.4;
        // weight for accumulated score fairness component (0..1).
        public double PriorityBeta { get; set; } = 0.3;
        // weight for recent loot count fairness component (0..1).
        public double PriorityGamma { get; set; } = 0.3;
        // minimum item level required per difficulty
        public int MinIlevelNormal { get; set; } = 0;
        public int MinIlevelHeroic { get; set; } = 0;
        public int MinIlevelMythic { get; set; } = 0;
        // half-life (days) for score decay used in the β fairness factor. 0 = decay disabled (default, backward compatible).
        public int ScoreDecayHalfLifeDays { get; set; } = 0;
    }
}