using FairLoot.Data;
using FairLoot.Domain;
using FairLoot.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FairLoot.Controllers
{
    [Route("api/[controller]")]
    [Authorize]
    public class GuildMemberController : BaseApiController
    {
        private readonly AppDbContext _context;

        public GuildMemberController(AppDbContext context)
        {
            _context = context;
        }

        // GET api/guildmember
        [HttpGet]
        public async Task<IActionResult> GetMembers()
        {
            var (user, error) = await GetAuthenticatedUserWithGuildAsync(_context);
            if (error != null) return error;

            var members = await _context.Users
                .Where(u => u.GuildId == user!.GuildId)
                .Select(u => new UserDto
                {
                    Id = u.Id,
                    Email = u.Email,
                    Role = u.Role,
                    CreatedAt = u.CreatedAt
                })
                .ToListAsync();

            return Ok(members);
        }

        // POST api/guildmember
        [HttpPost]
        public async Task<IActionResult> AddMember([FromBody] CreateMemberRequest request)
        {
            var (user, error) = await GetAuthenticatedAdminAsync(_context);
            if (error != null) return error;

            var newMember = new User
            {
                Email = request.Email,
                Role = request.Role,
                GuildId = user!.GuildId,
                IsApproved = true,
                PasswordHash = string.Empty,
                CharacterName = request.CharacterName
            };

            _context.Users.Add(newMember);
            await _context.SaveChangesAsync();

            if (!string.IsNullOrEmpty(request.CharacterName))
            {
                var existsChar = await _context.Characters.FirstOrDefaultAsync(
                    c => c.GuildId == user.GuildId && c.Name == request.CharacterName);
                if (existsChar == null)
                {
                    _context.Characters.Add(new Character
                    {
                        Id = Guid.NewGuid(),
                        Name = request.CharacterName,
                        Realm = user.Guild!.Server,
                        Class = null,
                        Score = 0,
                        IsActive = true,
                        GuildId = user.GuildId
                    });
                    await _context.SaveChangesAsync();
                }
            }

            return Ok(new UserDto
            {
                Id = newMember.Id,
                Email = newMember.Email,
                Role = newMember.Role,
                CreatedAt = newMember.CreatedAt
            });
        }

        // PUT api/guildmember/{id}
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateMember(Guid id, [FromBody] UpdateMemberRequest request)
        {
            var (user, error) = await GetAuthenticatedAdminAsync(_context);
            if (error != null) return error;

            var member = await _context.Users
                .FirstOrDefaultAsync(u => u.Id == id && u.GuildId == user!.GuildId);

            if (member == null)
                return NotFound("Membro não encontrado.");

            if (!string.IsNullOrEmpty(request.Email)) member.Email = request.Email;
            if (!string.IsNullOrEmpty(request.Role)) member.Role = request.Role;

            await _context.SaveChangesAsync();

            return Ok(new UserDto
            {
                Id = member.Id,
                Email = member.Email,
                Role = member.Role,
                CreatedAt = member.CreatedAt
            });
        }

        // DELETE api/guildmember/{id}
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteMember(Guid id)
        {
            var (user, error) = await GetAuthenticatedAdminAsync(_context);
            if (error != null) return error;

            var member = await _context.Users
                .FirstOrDefaultAsync(u => u.Id == id && u.GuildId == user!.GuildId);

            if (member == null)
                return NotFound("Membro não encontrado.");

            if (!string.IsNullOrEmpty(member.CharacterName))
            {
                var ch = await _context.Characters.FirstOrDefaultAsync(
                    c => c.GuildId == user!.GuildId && c.Name == member.CharacterName);
                if (ch != null)
                    ch.IsActive = false;
            }

            _context.Users.Remove(member);
            await _context.SaveChangesAsync();

            return NoContent();
        }
    }
}