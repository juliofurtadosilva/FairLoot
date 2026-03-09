using System;

namespace FairLoot.Domain
{
    public class RefreshToken
    {
        public Guid Id { get; set; }
        public required string Token { get; set; }
        public DateTime Expires { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? RevokedAt { get; set; }
        public string? ReplacedByToken { get; set; }

        public Guid UserId { get; set; }
        public User? User { get; set; }

        public bool IsActive => RevokedAt == null && DateTime.UtcNow < Expires;
    }
}
