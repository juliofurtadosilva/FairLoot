namespace FairLoot.DTOs
{
    public class RegisterRequest
    {
        public required string GuildName { get; set; }
        public required string Server { get; set; }
        public required string Email { get; set; }
        public required string Password { get; set; }
        // Optional: api key for wowaudit associated with a new guild
        public string? WowauditApiKey { get; set; }
    }
}