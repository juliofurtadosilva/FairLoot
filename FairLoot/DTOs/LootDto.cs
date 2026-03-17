using System;
using System.Collections.Generic;

namespace FairLoot.DTOs
{
    public class SuggestItemRequest
    {
        public List<SuggestItem> Items { get; set; } = new List<SuggestItem>();
    }

    public class SuggestItem
    {
        public int? ItemId { get; set; }
        public string? ItemName { get; set; }
        public int Count { get; set; } = 1;
    }

    public class SuggestionResponse
    {
        public SuggestItem Item { get; set; } = new SuggestItem();
        public List<SuggestionCandidate> Candidates { get; set; } = new List<SuggestionCandidate>();
        public bool AllZeroUpgrade { get; set; }
        public bool SingleUpgradeOnly { get; set; }
    }

    public class SuggestionCandidate
    {
        public string CharacterName { get; set; } = string.Empty;
        public string? Class { get; set; }
        public double ItemPercentage { get; set; }
        public double OverallScore { get; set; }
        /// <summary>Number of loot items received in the recent period.</summary>
        public int LootReceivedCount { get; set; }
        /// <summary>Date of last loot received (null if never received).</summary>
        public DateTime? LastLootDate { get; set; }
        /// <summary>
        /// Combined priority: α × upgradeNorm + β × fairnessNorm + γ × lootCountNorm.
        /// Higher = should receive the item first.
        /// </summary>
        public double Priority { get; set; }
        public bool IsNewPlayer { get; set; }
    }

    public class DistributeRequest
    {
        public List<Distribution> Allocations { get; set; } = new List<Distribution>();
    }

    public class Distribution
    {
        public int? ItemId { get; set; }
        public string ItemName { get; set; } = string.Empty;
        public string AssignedTo { get; set; } = string.Empty; // character name
        public string Boss { get; set; } = string.Empty;
        public string Difficulty { get; set; } = string.Empty;
        public string? Note { get; set; }
        public bool IsSingleUpgrade { get; set; }
    }
}
