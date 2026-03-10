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
        // Blizzard realm slug for auto-fill (e.g. "azralon")
        public string? RealmSlug { get; set; }
        // Blizzard region (us, eu, kr, tw)
        public string? Region { get; set; }
        // Character name of the Guild Master for ownership verification
        public string? CharacterName { get; set; }
    }
}