using System;

namespace FairLoot.Domain
{
    // Persisted (not an in-memory dictionary) so the session survives a Render free-tier
    // cold start between the Battle.net OAuth callback and the user picking a character.
    public class BnetSession
    {
        public string Id { get; set; } = string.Empty;
        public DateTime Expiry { get; set; }
        public string CharactersJson { get; set; } = "[]";
        public string Region { get; set; } = "us";
        public string? BattleNetId { get; set; }
        public string? BattleTag { get; set; }
    }
}
