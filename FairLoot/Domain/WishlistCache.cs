namespace FairLoot.Domain
{
    public class WishlistCache
    {
        public Guid Id { get; set; }
        public Guid GuildId { get; set; }
        /// <summary>Serialized JSON of List&lt;CharacterWishlistSummary&gt;</summary>
        public string DataJson { get; set; } = string.Empty;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
