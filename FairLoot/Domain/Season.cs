using System;

namespace FairLoot.Domain
{
    public class Season
    {
        public Guid Id { get; set; }
        public Guid GuildId { get; set; }
        public string Name { get; set; } = string.Empty;
        public DateTime StartedAt { get; set; }
        public DateTime EndedAt { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
