namespace FairLoot.DTOs
{
    public class GuildUpdateDto
    {
        public string? Name { get; set; }
        public string? Server { get; set; }
        public string? WowauditApiKey { get; set; }
        public double? PriorityAlpha { get; set; }
        public double? PriorityBeta { get; set; }
        public double? PriorityGamma { get; set; }
        public int? MinIlevelNormal { get; set; }
        public int? MinIlevelHeroic { get; set; }
        public int? MinIlevelMythic { get; set; }
    }
}
