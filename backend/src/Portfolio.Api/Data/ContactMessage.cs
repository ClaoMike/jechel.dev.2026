namespace Portfolio.Api.Data;

/// <summary>
/// The start of a conversation: a message sent through the public contact form, or an email to the site's
/// address (hello@…) from someone it hasn't heard from. The admin answers by email, from that address; their
/// answers, and everything the visitor emails back, are <see cref="ContactReply"/>s.
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

    /// <summary>When anyone last wrote in it: the inbox lists conversations by this, newest first.</summary>
    public DateTimeOffset LastActivityAt { get; set; }

    /// <summary>The email's subject, for a conversation that started by email; the answers keep it ("Re: …").</summary>
    public string? Subject { get; set; }

    /// <summary>Resend's id of the email it came in, when it did: an email is only taken once.</summary>
    public string? EmailId { get; set; }

    /// <summary>The email's Message-ID header: the answer refers to it, so their mail app puts both in one thread.</summary>
    public string? EmailMessageId { get; set; }
}
