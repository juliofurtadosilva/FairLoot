using System.Collections.Generic;

namespace FairLoot.DTOs
{
    public class CharacterWishlistSummary
    {
        public string Name { get; set; } = string.Empty;
        public string Realm { get; set; } = string.Empty;
        public string Class { get; set; } = string.Empty;
        public double OverallPercentage { get; set; }
        // kept for backward compatibility (flattened), but prefer Instances for grouping
        public List<DifficultySummary> Difficulties { get; set; } = new List<DifficultySummary>();
        public List<InstanceSummary> Instances { get; set; } = new List<InstanceSummary>();
    }

    public class CharacterInfo
    {
        public string Name { get; set; } = string.Empty;
        public string Realm { get; set; } = string.Empty;
        public string Class { get; set; } = string.Empty;
    }

    public class DifficultySummary
    {
        public string Difficulty { get; set; } = string.Empty;
        public double TotalPercentage { get; set; }
        public int TotalAbsolute { get; set; }
        public List<EncounterSummary> Encounters { get; set; } = new List<EncounterSummary>();
    }

    public class EncounterSummary
    {
        public string Name { get; set; } = string.Empty;
        public double EncounterPercentage { get; set; }
        public int EncounterAbsolute { get; set; }
        public List<ItemSummary> Items { get; set; } = new List<ItemSummary>();
    }

    public class InstanceSummary
    {
        public string Name { get; set; } = string.Empty;
        public List<DifficultySummary> Difficulties { get; set; } = new List<DifficultySummary>();
    }

    public class ItemSummary
    {
        public string Name { get; set; } = string.Empty;
        public int? Id { get; set; }
        public string? Icon { get; set; }
        public double Percentage { get; set; }
        public double Absolute { get; set; }
        public string? Specialization { get; set; }
    }
}
