namespace Portfolio.Api.Features.Contact;

/// <summary>Body of the public contact form. Nullable so missing fields become validation errors, not 400s without details.</summary>
/// <param name="Topic">"project" for a project enquiry (Work with me); empty or missing for anything else.</param>
public record SendMessageRequest(string? Name, string? Email, string? Message, string? Topic = null);

/// <param name="LastActivityAt">When anyone last wrote in the conversation.</param>
/// <param name="Count">Messages in the conversation: the first and every one after.</param>
/// <param name="Subject">A project enquiry's, or an emailed conversation's subject; null for a plain message.</param>
public record ContactMessageSummary(int Id, string Name, DateTimeOffset ReceivedAt, bool IsRead, DateTimeOffset LastActivityAt, int Count, string? Subject = null);

/// <param name="Replies">Every message after the first, oldest first: the admin's answers and the visitor's.</param>
/// <param name="Meetings">Meetings the same address booked with Cal.com (not cancelled), soonest first: to accept or decline from the message.</param>
/// <param name="Subject">The email's subject, for a conversation that started by email.</param>
public record ContactMessageDetails(int Id, string Name, string Email, string Message, DateTimeOffset ReceivedAt, DateTimeOffset? ReadAt, IReadOnlyList<ContactReplyDto> Replies, IReadOnlyList<Meetings.MeetingDto> Meetings, string? Subject = null);

/// <param name="FromVisitor">Emailed by the visitor; false for the admin's answers.</param>
public record ContactReplyDto(int Id, string Text, DateTimeOffset SentAt, bool FromVisitor);

public record ReplyRequest(string? Text);

public static class ContactShared
{
    public const int DefaultPageSize = 10;
    public const int MaxPageSize = 50;

    /// <summary>The contact form, per IP (Contact:LimitPer10Minutes): nobody floods the inbox and the phone.</summary>
    public const string RateLimitPolicy = "contact";

    public const int ReplyMaxLength = 5000;

    /// <summary>
    /// Where a visitor's answer to the admin's email goes: to the sender (the site's address, where it joins the
    /// conversation) once the site receives email; until then, to the admin's own address, so it isn't lost. Resend's
    /// shared onboarding@resend.dev receives nothing, so it never counts.
    /// </summary>
    public static string? ReplyToFor(Updates.EmailOptions email, Auth.AdminOptions admins) =>
        email.IsReceiving && email.FromAddress.Length > 0 && !email.FromAddress.EndsWith("@resend.dev", StringComparison.OrdinalIgnoreCase) ? null : admins.AdminEmails.FirstOrDefault();
}
