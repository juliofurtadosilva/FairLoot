namespace FairLoot.DTOs
{
    public class BnetLoginSelectRequest
    {
        public required string SessionId { get; set; }
        public required Guid UserId { get; set; }
    }
}
