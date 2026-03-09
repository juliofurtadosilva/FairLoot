using FairLoot.Data;
using FairLoot.Domain;
using FairLoot.DTOs;
using FairLoot.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;

namespace FairLoot.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly TokenService _tokenService;
        private readonly IPasswordHasher<User> _passwordHasher;
        private readonly WowAuditService _wow;

        public AuthController(AppDbContext context, TokenService tokenService, IPasswordHasher<User> passwordHasher, WowAuditService wow)
        {
            _context = context;
            _tokenService = tokenService;
            _passwordHasher = passwordHasher;
            _wow = wow;
        }

        [AllowAnonymous]
        [HttpPost("register")]
        public async Task<IActionResult> Register(RegisterRequest request)
        {
            // if guild already exists, create user as Reader and mark pending approval
            var existingGuild = await _context.Guilds.FirstOrDefaultAsync(g => g.Name == request.GuildName && g.Server == request.Server);
            if (existingGuild != null)
            {
                var user = new User
                {
                    Email = request.Email,
                    GuildId = existingGuild.Id,
                    Guild = existingGuild,
                    Role = UserRoles.Reader,
                    PasswordHash = string.Empty,
                    IsApproved = false
                };
                user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);
                _context.Users.Add(user);
                await _context.SaveChangesAsync();

                return Ok(new { message = "Guild já existe. Conta criada como Reader e pendente de aprovação pelo Admin da guild." });
            }

            // create new guild and set provided wowaudit key (if any); user becomes Admin and approved
            var guild = new Guild { Name = request.GuildName, Server = request.Server, WowauditApiKey = request.WowauditApiKey };
            _context.Guilds.Add(guild);

            var adminUser = new User
            {
                Email = request.Email,
                Guild = guild,
                Role = UserRoles.Admin,
                PasswordHash = string.Empty,
                IsApproved = true
            };
            adminUser.PasswordHash = _passwordHasher.HashPassword(adminUser, request.Password);
            _context.Users.Add(adminUser);

            await _context.SaveChangesAsync();

            // after creating the guild and admin user, try to sync characters for this guild (new characters start with score = 0)
            try
            {
                if (!string.IsNullOrEmpty(guild.WowauditApiKey))
                    await _wow.SyncGuildCharactersAsync(_context, guild.Id, guild.WowauditApiKey);
            }
            catch
            {
                // ignore sync errors during registration
            }

            // generate tokens
            var accessToken = _tokenService.GenerateToken(adminUser);
            var (refreshTokenString, refreshExpires) = _tokenService.GenerateRefreshToken();

            var refreshToken = new RefreshToken
            {
                Token = refreshTokenString,
                Expires = refreshExpires,
                User = adminUser
            };
            _context.RefreshTokens.Add(refreshToken);
            await _context.SaveChangesAsync();

            // set refresh token as HttpOnly cookie (secure in production)
            SetRefreshCookie(refreshTokenString, refreshExpires);

            return Ok(new { token = accessToken });
        }

        [AllowAnonymous]
        [HttpPost("login")]
        public async Task<IActionResult> Login(LoginRequest request)
        {
            var user = await _context.Users.Include(u => u.RefreshTokens).FirstOrDefaultAsync(u => u.Email == request.Email);
            if (user == null)
                return Unauthorized("Credenciais inválidas.");

            var verify = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
            if (verify != PasswordVerificationResult.Success)
                return Unauthorized("Credenciais inválidas.");

            if (!user.IsApproved)
            {
                return Ok(new { message = "Conta pendente de aprovação pelo Admin da guild." });
            }

            var accessToken = _tokenService.GenerateToken(user);
            var (refreshTokenString, refreshExpires) = _tokenService.GenerateRefreshToken();

            var refreshToken = new RefreshToken
            {
                Token = refreshTokenString,
                Expires = refreshExpires,
                User = user
            };
            _context.RefreshTokens.Add(refreshToken);
            await _context.SaveChangesAsync();

            // set cookie
            SetRefreshCookie(refreshToken.Token, refreshToken.Expires);

            return Ok(new { token = accessToken });
        }

        [AllowAnonymous]
        [HttpPost("refresh")]
        public async Task<IActionResult> Refresh(RefreshRequest request)
        {
            // read refresh token from cookie if not provided in body
            var tokenFromBody = request?.RefreshToken;
            var cookieToken = Request.Cookies["refreshToken"];
            var token = !string.IsNullOrEmpty(tokenFromBody) ? tokenFromBody : cookieToken;
            if (string.IsNullOrEmpty(token))
                return BadRequest("Refresh token é obrigatório.");

            var existing = await _context.RefreshTokens.Include(r => r.User).FirstOrDefaultAsync(r => r.Token == token);
            if (existing == null || !existing.IsActive)
                return Unauthorized("Refresh token inválido ou expirado.");

            // revoke current refresh token
            existing.RevokedAt = DateTime.UtcNow;

            // create new refresh token
            var (newRefreshString, newRefreshExpires) = _tokenService.GenerateRefreshToken();
            existing.ReplacedByToken = newRefreshString;

            var newRefresh = new RefreshToken
            {
                Token = newRefreshString,
                Expires = newRefreshExpires,
                UserId = existing.UserId
            };
            _context.RefreshTokens.Add(newRefresh);

            // generate new access token
            var accessToken = _tokenService.GenerateToken(existing.User!);

            await _context.SaveChangesAsync();

            // update cookie with new refresh token
            SetRefreshCookie(newRefreshString, newRefreshExpires);

            return Ok(new { token = accessToken });
        }

        [Authorize]
        [HttpPost("revoke")]
        public async Task<IActionResult> Revoke(RevokeRequest request)
        {
            // allow revoke by body or by cookie
            var token = request?.RefreshToken ?? Request.Cookies["refreshToken"];
            if (string.IsNullOrEmpty(token))
                return BadRequest("Refresh token é obrigatório.");

            var userIdClaim = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(userIdClaim, out var userId))
                return Unauthorized();

            var existing = await _context.RefreshTokens.FirstOrDefaultAsync(r => r.Token == token);
            if (existing == null || existing.UserId != userId)
                return Unauthorized();

            if (!existing.IsActive)
                return BadRequest("Refresh token já expirado ou revogado.");

            existing.RevokedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            // delete cookie on client
            Response.Cookies.Delete("refreshToken");

            return NoContent();
        }

        [Authorize]
        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            var userIdClaim = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(userIdClaim, out var userId))
                return Unauthorized();

            // IsActive is a computed property and cannot be translated to SQL by EF Core.
            // Use explicit conditions that EF can translate instead.
            var now = DateTime.UtcNow;
            var tokens = await _context.RefreshTokens
                .Where(r => r.UserId == userId && r.RevokedAt == null && r.Expires > now)
                .ToListAsync();
            foreach (var t in tokens)
                t.RevokedAt = DateTime.UtcNow;

            // increment token version? (optional) - not implemented here

            await _context.SaveChangesAsync();

            // delete cookie on client
            Response.Cookies.Delete("refreshToken");

            return NoContent();
        }

        private void SetRefreshCookie(string token, DateTime expires)
        {
            // For dev over HTTP browsers may reject SameSite=None without Secure.
            // Use None+Secure when running HTTPS, otherwise fallback to Lax for local dev.
            var cookieOptions = new CookieOptions
            {
                HttpOnly = true,
                Expires = expires,
                Secure = Request.IsHttps,
                SameSite = Request.IsHttps ? SameSiteMode.None : SameSiteMode.Lax,
                Path = "/"
            };
            Response.Cookies.Append("refreshToken", token, cookieOptions);
        }

        [Authorize]
        [HttpGet("me")]
        public async Task<IActionResult> Me()
        {
            var userIdClaim = User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(userIdClaim, out var userId))
                return Unauthorized();

            var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null) return Unauthorized();

            return Ok(new { id = user.Id, email = user.Email, role = user.Role, isApproved = user.IsApproved, guildId = user.GuildId });
        }

        [AllowAnonymous]
        [HttpGet("check-guild")]
        public async Task<IActionResult> CheckGuild([FromQuery] string name, [FromQuery] string server)
        {
            if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(server))
                return Ok(new { exists = false });

            var exists = await _context.Guilds.AnyAsync(g => g.Name == name && g.Server == server);
            return Ok(new { exists });
        }
    }
}