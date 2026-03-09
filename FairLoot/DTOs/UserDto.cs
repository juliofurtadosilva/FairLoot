using System;

namespace FairLoot.DTOs
{
    public class UserDto
    {
        public Guid Id { get; set; }
        public string Email { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
    }

    public class CreateMemberRequest
    {
        public required string Email { get; set; }
        public required string Role { get; set; }
        public string? CharacterName { get; set; }
    }

    public class UpdateMemberRequest
    {
        public string? Email { get; set; }
        public string? Role { get; set; }
    }
}