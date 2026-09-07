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
        // true when the admin manually assigned this item outside the suggestion algorithm — no score impact.
        public bool IsManualAssignment { get; set; } = false;
        // true when a normal (non-manual) suggestion pick was given without counting toward score.
        public bool NoScore { get; set; } = false;
        // true when this pick is a transmog (never scores). Independent of AssignedTo — a manually
        // assigned transmog pick keeps the recipient's name instead of blanking it like an auto-detected one.
        public bool IsTransmogPick { get; set; } = false;
    }
}
