namespace FairLoot.DTOs
{
    public class BnetRegisterRequest
    {
        public required string SessionId { get; set; }
        public required int CharacterIndex { get; set; }
        public string? WowauditApiKey { get; set; }
    }
}
