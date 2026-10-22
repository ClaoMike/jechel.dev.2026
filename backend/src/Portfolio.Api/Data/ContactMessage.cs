namespace Portfolio.Api.Data;

/// <summary>
/// A message sent through the public contact form: the start of a conversation. The admin answers by email,
/// with a link to it (<see cref="Token"/>), where the visitor can write back; every message after the first
/// is a <see cref="ContactReply"/>.
/// </summary>
public class ContactMessage
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public required string Email { get; set; }
    public required string Message { get; set; }
    public DateTimeOffset ReceivedAt { get; set; }

    /// <summary>When the admin first opened it; null while unread, and again after the visitor writes back.</summary>
    public DateTimeOffset? ReadAt { get; set; }

    /// <summary>Random and unique: in the link to the conversation, so only whoever got the email can read and write in it.</summary>
    public required string Token { get; set; }

    /// <summary>When anyone last wrote in it: the inbox lists conversations by this, newest first.</summary>
    public DateTimeOffset LastActivityAt { get; set; }
}
