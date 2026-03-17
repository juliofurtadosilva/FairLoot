using System;

namespace FairLoot.Domain
{
    public class LootDrop
    {
        public Guid Id { get; set; }
        public Guid GuildId { get; set; }
        public string Boss { get; set; } = string.Empty;
        public string Difficulty { get; set; } = string.Empty;
        public int? ItemId { get; set; }
        public string ItemName { get; set; } = string.Empty;
        public string AssignedTo { get; set; } = string.Empty; // character name
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public double AwardValue { get; set; } = 0; // value added to character score
        public string? Note { get; set; }
        public bool IsReverted { get; set; } = false;
        public DateTime? RevertedAt { get; set; }
    }
}
