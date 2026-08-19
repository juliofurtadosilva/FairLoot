using System;

namespace FairLoot.Domain
{
    public class BnetLoginSession
    {
        public string Id { get; set; } = string.Empty;
        public DateTime Expiry { get; set; }
        public string? BattleNetId { get; set; }
        public string? BattleTag { get; set; }
    }
}
