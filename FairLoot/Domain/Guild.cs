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
    }
}