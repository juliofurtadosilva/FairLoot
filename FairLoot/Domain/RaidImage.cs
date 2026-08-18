using System;

namespace FairLoot.Domain
{
    public class RaidImage
    {
        public Guid Id { get; set; }
        public Guid GuildId { get; set; }
        // "boss" or "raid"
        public string EntityType { get; set; } = "boss";
        public string Name { get; set; } = string.Empty;
        // zamimg filename (e.g. "ui-ej-boss-host-general.png")
        public string ImageFile { get; set; } = string.Empty;
    }
}
