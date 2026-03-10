using System.Text.Json.Serialization;

namespace FairLoot.Domain
{
    public class User
    {
        public Guid Id { get; set; }
        public string? Email { get; set; }

        [JsonIgnore]
        public string PasswordHash { get; set; } = string.Empty;

        // Battle.net unique account identifier
        public string? BattleNetId { get; set; }
        public string? BattleTag { get; set; }

        public Guid GuildId { get; set; }

        // prevent cycles when serializing Guild -> Members -> Guild
        [JsonIgnore]
        public Guild Guild { get; set; } = null!;

        public required string Role { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // users that join an existing guild need admin approval
        public bool IsApproved { get; set; } = true;

        [JsonIgnore]
        public List<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();

        // Optional mapping from account to character name in the guild. Useful to tie a User to a Character record.
        public string? CharacterName { get; set; }
    }
}
