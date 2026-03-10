namespace FairLoot.DTOs
{
    public class BnetCharactersRequest
    {
        public required string Code { get; set; }
        public required string RedirectUri { get; set; }
        public string Region { get; set; } = "us";
    }
}
