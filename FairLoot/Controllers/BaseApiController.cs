using FairLoot.Data;
using FairLoot.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace FairLoot.Controllers
{
    [ApiController]
    public abstract class BaseApiController : ControllerBase
    {
        protected Guid? GetUserIdFromToken()
        {
            var claim = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
                     ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
            return Guid.TryParse(claim, out var id) ? id : null;
        }

        protected async Task<(User? user, IActionResult? error)> GetAuthenticatedUserWithGuildAsync(
            AppDbContext context, bool requireApproval = true)
        {
            var userId = GetUserIdFromToken();
            if (userId == null)
                return (null, Unauthorized("Token inválido."));

            var user = await context.Users
                .Include(u => u.Guild)
                .FirstOrDefaultAsync(u => u.Id == userId.Value);

            if (user == null || user.Guild == null)
                return (null, NotFound("Guild não encontrada."));

            if (requireApproval && !user.IsApproved)
                return (null, Forbid("Conta pendente de aprovação."));

            return (user, null);
        }

        protected async Task<(User? user, IActionResult? error)> GetAuthenticatedAdminAsync(
            AppDbContext context)
        {
            var (user, error) = await GetAuthenticatedUserWithGuildAsync(context);
            if (error != null) return (null, error);

            if (user!.Role != UserRoles.Admin)
                return (null, Forbid("Apenas Admin pode executar esta ação."));

            return (user, null);
        }
    }
}
