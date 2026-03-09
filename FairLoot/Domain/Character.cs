using System;

namespace FairLoot.Domain
{
    public class Character
    {
        public Guid Id { get; set; }
        public required string Name { get; set; }
        public string? Realm { get; set; }
        public string? Class { get; set; }
        // overall score used for prioritization (from wowaudit overallPercentage)
        public double Score { get; set; }
        public bool IsActive { get; set; } = true;

        public Guid GuildId { get; set; }
        public Guild? Guild { get; set; }
    }
}
