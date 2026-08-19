namespace FairLoot.Domain
{
    /// <summary>Audit trail of SimC (raidbots/QE) report uploads to wowaudit — who sent what, for whom, when.</summary>
    public class SimcUploadLog
    {
        public Guid Id { get; set; }
        public Guid GuildId { get; set; }
        public Guid? UserId { get; set; }
        // display name of whoever submitted (battletag/email) — kept even if the User is later removed
        public string SubmittedBy { get; set; } = string.Empty;
        public string? CharacterName { get; set; }
        public string? Realm { get; set; }
        public string? Spec { get; set; }
        public string? Source { get; set; }
        public string? ReportId { get; set; }
        public string? Difficulty { get; set; }
        public bool Success { get; set; }
        public string? ErrorMessage { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
