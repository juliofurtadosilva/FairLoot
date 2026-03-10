namespace FairLoot.DTOs
{
    public class BnetLoginRequest
    {
        public required string Code { get; set; }
        public required string RedirectUri { get; set; }
        public string Region { get; set; } = "us";
    }
}
