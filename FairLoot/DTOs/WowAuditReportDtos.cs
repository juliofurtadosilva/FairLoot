namespace FairLoot.DTOs
{
    public class SubmitReportRequestDto
    {
        public string Url { get; set; } = string.Empty;
    }

    public class SubmitReportResultDto
    {
        public bool Success { get; set; }
        public string? Error { get; set; }
        public string? CharacterName { get; set; }
        public string? Realm { get; set; }
        public string? Spec { get; set; }
        public string? Source { get; set; }
        public string? ReportId { get; set; }
        public string? Difficulty { get; set; }
    }
}
