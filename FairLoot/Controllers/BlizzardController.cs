using FairLoot.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FairLoot.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class BlizzardController : ControllerBase
    {
        private readonly BlizzardService _blizzard;

        public BlizzardController(BlizzardService blizzard)
        {
            _blizzard = blizzard;
        }

        [AllowAnonymous]
        [HttpGet("realms")]
        public async Task<IActionResult> Realms([FromQuery] string region = "us")
        {
            var realms = await _blizzard.GetRealmsAsync(region);
            if (realms == null)
                return Ok(new { realms = Array.Empty<object>() });
            return Ok(new { realms });
        }

        [AllowAnonymous]
        [HttpGet("guild")]
        public async Task<IActionResult> Guild([FromQuery] string realm, [FromQuery] string name, [FromQuery] string region = "us")
        {
            if (string.IsNullOrWhiteSpace(realm) || string.IsNullOrWhiteSpace(name))
                return BadRequest("realm and name are required");

            var realmSlug = BlizzardService.ToSlug(realm);
            var nameSlug = BlizzardService.ToSlug(name);
            var guild = await _blizzard.GetGuildAsync(realmSlug, nameSlug, region);
            if (guild == null)
                return Ok(new { found = false });

            return Ok(new { found = true, guild });
        }

        [AllowAnonymous]
        [HttpGet("guild/verify-gm")]
        public async Task<IActionResult> VerifyGm(
            [FromQuery] string realm,
            [FromQuery] string name,
            [FromQuery] string characterName,
            [FromQuery] string region = "us")
        {
            if (string.IsNullOrWhiteSpace(realm) || string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(characterName))
                return BadRequest("realm, name, and characterName are required");

            var realmSlug = BlizzardService.ToSlug(realm);
            var nameSlug = BlizzardService.ToSlug(name);
            var result = await _blizzard.VerifyGuildMasterAsync(realmSlug, nameSlug, characterName, region);
            return Ok(result);
        }
    }
}
