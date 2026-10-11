namespace Portfolio.Api.Data;

/// <summary>A message sent through the public contact form.</summary>
public class ContactMessage
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public required string Email { get; set; }
    public required string Message { get; set; }
    public DateTimeOffset ReceivedAt { get; set; }

    /// <summary>When the admin first opened it; null while unread.</summary>
    public DateTimeOffset? ReadAt { get; set; }
}
