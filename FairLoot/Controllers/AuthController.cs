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
using System.Collections.Concurrent;

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
        private readonly BlizzardService _blizzard;

        // In-memory session store for Battle.net registration flow
        private static readonly ConcurrentDictionary<string, BnetSession> _bnetSessions = new();
        // In-memory session store for Battle.net login flow (multi-account selection)
        private static readonly ConcurrentDictionary<string, BnetLoginSession> _bnetLoginSessions = new();

        private class BnetSession
        {
            public DateTime Expiry { get; set; }
            public List<BnetCharacterInfo> Characters { get; set; } = new();
            public string Region { get; set; } = "us";
            public string? BattleNetId { get; set; }
            public string? BattleTag { get; set; }
        }

        private class BnetLoginSession
        {
            public DateTime Expiry { get; set; }
            public string? BattleNetId { get; set; }
            public string? BattleTag { get; set; }
        }

        public AuthController(AppDbContext context, TokenService tokenService, IPasswordHasher<User> passwordHasher, WowAuditService wow, BlizzardService blizzard)
        {
            _context = context;
            _tokenService = tokenService;
            _passwordHasher = passwordHasher;
            _wow = wow;
            _blizzard = blizzard;
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
            // If Blizzard credentials are configured and character name is provided, verify Guild Master ownership
            var region = request.Region ?? "us";
            var realmSlug = request.RealmSlug ?? BlizzardService.ToSlug(request.Server);
            var guildNameSlug = BlizzardService.ToSlug(request.GuildName);

            if (!string.IsNullOrWhiteSpace(request.CharacterName))
            {
                var gmCheck = await _blizzard.VerifyGuildMasterAsync(realmSlug, guildNameSlug, request.CharacterName, region);
                if (gmCheck.Error == null && !gmCheck.IsGuildMaster)
                {
                    return BadRequest($"O personagem '{request.CharacterName}' não é o Guild Master desta guild. O GM atual é '{gmCheck.GuildMasterName}'.");
                }
                // If Blizzard API is not configured (gmCheck.Error != null), allow registration without verification
            }

            var guild = new Guild
            {
                Name = request.GuildName,
                Server = request.Server,
                RealmSlug = realmSlug,
                Region = region,
                WowauditApiKey = request.WowauditApiKey
            };
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

            return Ok(new { id = user.Id, email = user.Email, battleTag = user.BattleTag, characterName = user.CharacterName, role = user.Role, isApproved = user.IsApproved, guildId = user.GuildId });
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

        // ─── Battle.net OAuth2 Registration Flow ────────────────────────────

        /// <summary>Returns the Battle.net OAuth authorize URL for the given region.</summary>
        [AllowAnonymous]
        [HttpGet("bnet/url")]
        public IActionResult GetBnetUrl([FromQuery] string region = "us", [FromQuery] string redirectUri = "")
        {
            if (string.IsNullOrWhiteSpace(redirectUri))
                return BadRequest("redirectUri is required");

            var url = _blizzard.GetAuthorizeUrl(redirectUri, region, region);
            if (url == null)
                return BadRequest("Blizzard API not configured");

            return Ok(new { url });
        }

        /// <summary>Exchange Battle.net OAuth code for characters. Returns a sessionId + character list.</summary>
        [AllowAnonymous]
        [HttpPost("bnet/characters")]
        public async Task<IActionResult> BnetCharacters(BnetCharactersRequest request)
        {
            // Clean up expired sessions
            var now = DateTime.UtcNow;
            foreach (var key in _bnetSessions.Keys.ToList())
            {
                if (_bnetSessions.TryGetValue(key, out var s) && s.Expiry < now)
                    _bnetSessions.TryRemove(key, out _);
            }

            // Exchange code for user token
            var userToken = await _blizzard.ExchangeCodeForTokenAsync(request.Code, request.RedirectUri, request.Region);
            if (userToken == null)
                return BadRequest("Failed to authenticate with Battle.net. The code may have expired.");

            // Get Battle.net user identity
            var userInfo = await _blizzard.GetUserInfoAsync(userToken, request.Region);
            if (userInfo == null || string.IsNullOrEmpty(userInfo.Sub))
                return BadRequest("Failed to get Battle.net user info.");

            // Get user's WoW characters
            var characters = await _blizzard.GetUserCharactersAsync(userToken, request.Region);
            if (characters == null || characters.Count == 0)
                return BadRequest("No WoW characters found on this Battle.net account.");

            // Enrich top characters with guild info
            var enriched = await _blizzard.EnrichCharactersWithGuildsAsync(characters, request.Region);

            // Store in session
            var sessionId = Guid.NewGuid().ToString("N");
            _bnetSessions[sessionId] = new BnetSession
            {
                Expiry = DateTime.UtcNow.AddMinutes(15),
                Characters = enriched,
                Region = request.Region,
                BattleNetId = userInfo.Sub,
                BattleTag = userInfo.BattleTag
            };

            // Check which guilds this BattleNetId is already registered in
            var registeredGuilds = await _context.Users
                .Where(u => u.BattleNetId == userInfo.Sub)
                .Include(u => u.Guild)
                .Select(u => new { guildName = u.Guild.Name, guildServer = u.Guild.Server })
                .ToListAsync();

            return Ok(new { sessionId, characters = enriched, battleTag = userInfo.BattleTag, registeredGuilds });
        }

        /// <summary>Complete registration using a Battle.net session. Checks guild rank to determine Admin vs Reader.</summary>
        [AllowAnonymous]
        [HttpPost("bnet/register")]
        public async Task<IActionResult> BnetRegister(BnetRegisterRequest request)
        {
            // Validate session
            if (!_bnetSessions.TryRemove(request.SessionId, out var session) || session.Expiry < DateTime.UtcNow)
                return BadRequest("Session expired. Please connect with Battle.net again.");

            if (request.CharacterIndex < 0 || request.CharacterIndex >= session.Characters.Count)
                return BadRequest("Invalid character selection.");

            var selectedChar = session.Characters[request.CharacterIndex];

            // Character must have a guild
            if (string.IsNullOrEmpty(selectedChar.GuildName) || string.IsNullOrEmpty(selectedChar.GuildRealmSlug))
                return BadRequest("The selected character has no guild.");

            var guildName = selectedChar.GuildName;
            var guildRealmSlug = selectedChar.GuildRealmSlug;
            var guildRealmName = selectedChar.GuildRealmName ?? selectedChar.RealmName;
            var region = session.Region;

            // Check if this BattleNetId already has a user in this guild
            var existingGuild = await _context.Guilds.FirstOrDefaultAsync(g =>
                g.Name == guildName && g.Server == guildRealmName);

            if (existingGuild != null && await _context.Users.AnyAsync(u => u.BattleNetId == session.BattleNetId && u.GuildId == existingGuild.Id))
                return BadRequest("You are already registered in this guild. Please login instead.");

            if (existingGuild != null)
            {
                // Guild exists → create Reader, pending approval
                var user = new User
                {
                    GuildId = existingGuild.Id,
                    Guild = existingGuild,
                    Role = UserRoles.Reader,
                    IsApproved = false,
                    CharacterName = selectedChar.Name,
                    BattleNetId = session.BattleNetId,
                    BattleTag = session.BattleTag
                };
                _context.Users.Add(user);
                await _context.SaveChangesAsync();

                return Ok(new { message = "Guild já existe no FairLoot. Conta criada como Reader e pendente de aprovação pelo Admin." });
            }

            // Guild doesn't exist → check if character is GM or Officer (rank 0 or 1)
            var guildSlug = BlizzardService.ToSlug(guildName);
            var rank = await _blizzard.GetCharacterRankAsync(guildRealmSlug, guildSlug, selectedChar.Name, region);

            // If Blizzard API returned a rank, enforce GM/Officer requirement
            if (rank.HasValue && rank.Value > 1)
            {
                return BadRequest($"O personagem '{selectedChar.Name}' é rank {rank.Value} na guild. Apenas Guild Master (rank 0) ou Oficiais (rank 1) podem criar uma guild no FairLoot.");
            }
            // If rank is null (API not configured or error), allow registration as fallback

            // Create new guild + Admin user
            var guild = new Guild
            {
                Name = guildName,
                Server = guildRealmName,
                RealmSlug = guildRealmSlug,
                Region = region,
                WowauditApiKey = request.WowauditApiKey
            };
            _context.Guilds.Add(guild);

            var adminUser = new User
            {
                Guild = guild,
                Role = UserRoles.Admin,
                IsApproved = true,
                CharacterName = selectedChar.Name,
                BattleNetId = session.BattleNetId,
                BattleTag = session.BattleTag
            };
            _context.Users.Add(adminUser);
            await _context.SaveChangesAsync();

            // Sync WowAudit characters if key provided
            try
            {
                if (!string.IsNullOrEmpty(guild.WowauditApiKey))
                    await _wow.SyncGuildCharactersAsync(_context, guild.Id, guild.WowauditApiKey);
            }
            catch { /* ignore sync errors */ }

            // Generate tokens
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

            SetRefreshCookie(refreshTokenString, refreshExpires);

            return Ok(new { token = accessToken });
        }

        /// <summary>Login via Battle.net OAuth. Exchanges code, finds user(s) by BattleNetId.</summary>
        [AllowAnonymous]
        [HttpPost("bnet/login")]
        public async Task<IActionResult> BnetLogin(BnetLoginRequest request)
        {
            // Exchange code for user token
            var userToken = await _blizzard.ExchangeCodeForTokenAsync(request.Code, request.RedirectUri, request.Region);
            if (userToken == null)
                return BadRequest("Failed to authenticate with Battle.net.");

            // Get Battle.net user identity
            var userInfo = await _blizzard.GetUserInfoAsync(userToken, request.Region);
            if (userInfo == null || string.IsNullOrEmpty(userInfo.Sub))
                return BadRequest("Failed to get Battle.net user info.");

            // Find all users with this BattleNetId
            var users = await _context.Users
                .Where(u => u.BattleNetId == userInfo.Sub)
                .Include(u => u.Guild)
                .ToListAsync();

            if (users.Count == 0)
                return BadRequest("Account not found. Please register first.");

            // Update BattleTag on all accounts if changed
            if (userInfo.BattleTag != null)
            {
                foreach (var u in users.Where(u => u.BattleTag != userInfo.BattleTag))
                    u.BattleTag = userInfo.BattleTag;
                await _context.SaveChangesAsync();
            }

            if (users.Count == 1)
            {
                // Single account — login directly
                return await IssueLoginResponse(users[0]);
            }

            // Multiple accounts — return selection
            // Clean up expired login sessions
            var now = DateTime.UtcNow;
            foreach (var key in _bnetLoginSessions.Keys.ToList())
                if (_bnetLoginSessions.TryGetValue(key, out var s) && s.Expiry < now)
                    _bnetLoginSessions.TryRemove(key, out _);

            var sessionId = Guid.NewGuid().ToString("N");
            _bnetLoginSessions[sessionId] = new BnetLoginSession
            {
                Expiry = DateTime.UtcNow.AddMinutes(10),
                BattleNetId = userInfo.Sub,
                BattleTag = userInfo.BattleTag
            };

            var accounts = users.Select(u => new
            {
                userId = u.Id,
                characterName = u.CharacterName,
                guildName = u.Guild?.Name,
                guildServer = u.Guild?.Server,
                role = u.Role,
                isApproved = u.IsApproved
            });

            return Ok(new { sessionId, accounts });
        }

        /// <summary>Select which account to login to (when user has multiple guilds).</summary>
        [AllowAnonymous]
        [HttpPost("bnet/login/select")]
        public async Task<IActionResult> BnetLoginSelect([FromBody] BnetLoginSelectRequest request)
        {
            if (!_bnetLoginSessions.TryRemove(request.SessionId, out var session) || session.Expiry < DateTime.UtcNow)
                return BadRequest("Session expired. Please login again.");

            var user = await _context.Users
                .Include(u => u.Guild)
                .FirstOrDefaultAsync(u => u.Id == request.UserId && u.BattleNetId == session.BattleNetId);

            if (user == null)
                return BadRequest("Invalid account selection.");

            return await IssueLoginResponse(user);
        }

        private async Task<IActionResult> IssueLoginResponse(User user)
        {
            if (!user.IsApproved)
                return Ok(new { message = "Conta pendente de aprovação pelo Admin da guild." });

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

            SetRefreshCookie(refreshTokenString, refreshExpires);

            return Ok(new { token = accessToken });
        }
    }
}