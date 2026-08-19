namespace FairLoot.DTOs
{
    public class DiscordUploadRequestDto
    {
        // shared secret proving the request came from the FairLoot bot itself (one value, global — not per-guild)
        public string SharedSecret { get; set; } = string.Empty;
        // Discord server (guild) ID the /simc command was used in — selects which FairLoot guild to act on
        public string DiscordServerId { get; set; } = string.Empty;
        public string Url { get; set; } = string.Empty;
        public string? DiscordUserId { get; set; }
        public string? DiscordUsername { get; set; }
    }
}
