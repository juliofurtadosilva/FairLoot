namespace FairLoot.DTOs
{
    public class GuildUpdateDto
    {
        public string? Name { get; set; }
        public string? Server { get; set; }
        public string? WowauditApiKey { get; set; }
        public string? DiscordServerId { get; set; }
        public bool? DiscordDigestEnabled { get; set; }
        public string? DiscordDigestChannelId { get; set; }
        public string? DiscordDigestRoleId { get; set; }
        public string? DiscordDigestDifficulties { get; set; }
        public string? DiscordDigestTime { get; set; }
        public string? DiscordDigestTimezone { get; set; }
        public string? DiscordDigestDaysOfWeek { get; set; }
        public double? PriorityAlpha { get; set; }
        public double? PriorityBeta { get; set; }
        public double? PriorityGamma { get; set; }
        public int? MinIlevelNormal { get; set; }
        public int? MinIlevelHeroic { get; set; }
        public int? MinIlevelMythic { get; set; }
        public int? ScoreDecayHalfLifeDays { get; set; }
    }

    public class RaidImageUpsertDto
    {
        public string EntityType { get; set; } = "boss";
        public string Name { get; set; } = string.Empty;
        // empty/null removes the mapping (falls back to the hardcoded default)
        public string? ImageFile { get; set; }
    }
}
