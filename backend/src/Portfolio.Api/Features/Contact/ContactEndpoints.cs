using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;

namespace Portfolio.Api.Features.Contact;

/// <summary>Body of the public contact form. Nullable so missing fields become validation errors, not 400s without details.</summary>
public record SendMessageRequest(string? Name, string? Email, string? Message);

/// <param name="LastActivityAt">When anyone last wrote in the conversation.</param>
/// <param name="Count">Messages in the conversation: the first and every one after.</param>
public record ContactMessageSummary(int Id, string Name, DateTimeOffset ReceivedAt, bool IsRead, DateTimeOffset LastActivityAt, int Count);

/// <param name="Replies">Every message after the first, oldest first: the admin's answers and the visitor's.</param>
/// <param name="Meetings">Meetings the same address booked with Cal.com (not cancelled), soonest first: to accept or decline from the message.</param>
public record ContactMessageDetails(int Id, string Name, string Email, string Message, DateTimeOffset ReceivedAt, DateTimeOffset? ReadAt, IReadOnlyList<ContactReplyDto> Replies, IReadOnlyList<Meetings.MeetingDto> Meetings);

/// <param name="FromVisitor">Written by the visitor on the conversation's page; false for the admin's answers.</param>
public record ContactReplyDto(int Id, string Text, DateTimeOffset SentAt, bool FromVisitor);

/// <summary>A message in a conversation, as the visitor's page shows it.</summary>
/// <param name="FromVisitor">Theirs; false for the admin's.</param>
public record ConversationMessage(string Text, DateTimeOffset At, bool FromVisitor);

/// <summary>A conversation, for the visitor with its link: their name (not their address) and every message, oldest first.</summary>
public record ConversationDto(string Name, IReadOnlyList<ConversationMessage> Messages);

public record ReplyRequest(string? Text);

public static class ContactEndpoints
{
    public const int DefaultPageSize = 10;
    public const int MaxPageSize = 50;

    /// <summary>The contact form and the visitor's replies, per IP (Contact:LimitPer10Minutes): nobody floods the inbox and the phone.</summary>
    public const string RateLimitPolicy = "contact";

    public static IEndpointRouteBuilder MapContactEndpoints(this IEndpointRouteBuilder app)
    {
        var contact = app.MapGroup("/contact");

        // Public: anyone can send a message.
        contact.MapPost("/", SendMessage).WithName("SendContactMessage").RequireRateLimiting(RateLimitPolicy);

        // Public, with the conversation's link (emailed with each answer): read it, and write back.
        var conversations = contact.MapGroup("/conversations/{token}");
        conversations.MapGet("/", GetConversation).WithName("GetConversation");
        conversations.MapPost("/messages", WriteBack).WithName("WriteInConversation").RequireRateLimiting(RateLimitPolicy);

        // Admin only: the inbox.
        var messages = contact.MapGroup("/messages").RequireAuthorization();
        messages.MapGet("/", ListMessages).WithName("ListContactMessages");
        messages.MapGet("/{id:int}", GetMessage).WithName("GetContactMessage");
        messages.MapPost("/{id:int}/read", MarkAsRead).WithName("MarkContactMessageAsRead");
        messages.MapDelete("/{id:int}", DeleteMessage).WithName("DeleteContactMessage");
        messages.MapPost("/{id:int}/reply", Reply).WithName("ReplyToContactMessage");

        return app;
    }

    public static async Task<Results<Created, ValidationProblem>> SendMessage(
        SendMessageRequest request,
        PortfolioDbContext db,
        TimeProvider time,
        IPhoneAlerts alerts,
        CancellationToken cancellationToken)
    {
        var errors = ContactRules.Validate(request);
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var message = new ContactMessage
        {
            Name = request.Name!.Trim(),
            Email = request.Email!.Trim(),
            Message = request.Message!.Trim(),
            ReceivedAt = time.GetUtcNow(),
            Token = Updates.UpdatesEndpoints.NewToken(),
        };
        message.LastActivityAt = message.ReceivedAt;
        db.ContactMessages.Add(message);
        await db.SaveChangesAsync(cancellationToken);

        alerts.Send(new PhoneAlert(AlertKinds.Message, $"New message from {message.Name}", message.Message, "/contact", AlertPriority.High, "envelope"));

        return TypedResults.Created();
    }

    /// <summary>The latest conversations first (by when anyone last wrote). Out-of-range pages return no items (with the real total).</summary>
    public static async Task<Ok<PagedResponse<ContactMessageSummary>>> ListMessages(
        PortfolioDbContext db,
        CancellationToken cancellationToken,
        int page = 1,
        int pageSize = DefaultPageSize)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var totalCount = await db.ContactMessages.CountAsync(cancellationToken);
        var items = await db.ContactMessages
            .AsNoTracking()
            .OrderByDescending(m => m.LastActivityAt)
            .ThenByDescending(m => m.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(m => new ContactMessageSummary(m.Id, m.Name, m.ReceivedAt, m.ReadAt != null, m.LastActivityAt, 1 + db.ContactReplies.Count(r => r.MessageId == m.Id)))
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(new PagedResponse<ContactMessageSummary>(items, page, pageSize, totalCount));
    }

    /// <summary>Reading the details does not mark the message as read; the viewer calls <see cref="MarkAsRead"/>.</summary>
    public static async Task<Results<Ok<ContactMessageDetails>, NotFound>> GetMessage(
        int id,
        PortfolioDbContext db,
        CancellationToken cancellationToken)
    {
        var message = await db.ContactMessages.AsNoTracking().FirstOrDefaultAsync(m => m.Id == id, cancellationToken);
        if (message is null) return TypedResults.NotFound();

        var replies = await db.ContactReplies.AsNoTracking()
            .Where(r => r.MessageId == id)
            .OrderBy(r => r.SentAt)
            .ThenBy(r => r.Id)
            .Select(r => new ContactReplyDto(r.Id, r.Text, r.SentAt, r.FromVisitor))
            .ToListAsync(cancellationToken);
        var email = message.Email.ToLower();
        var meetings = await db.Meetings.AsNoTracking()
            .Where(m => m.AttendeeEmail.ToLower() == email && m.Status != Meetings.MeetingStatus.Cancelled)
            .OrderBy(m => m.StartTime)
            .Select(m => new Meetings.MeetingDto(m.Id, m.Title, m.StartTime, m.EndTime, m.AttendeeName, m.AttendeeEmail, m.AttendeeTimeZone, m.Notes, m.Status))
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(new ContactMessageDetails(message.Id, message.Name, message.Email, message.Message, message.ReceivedAt, message.ReadAt, replies, meetings));
    }

    public const int ReplyMaxLength = 5000;

    /// <summary>
    /// Admin only. Emails an answer to whoever sent the message (Resend), with a button to the conversation's page
    /// (where they write back), their last message quoted under it, and the admin's own address to reply to by
    /// email as well; keeps it with the conversation. 503 when it can't be sent.
    /// </summary>
    public static async Task<Results<Ok<ContactReplyDto>, NotFound, ValidationProblem, ProblemHttpResult>> Reply(
        int id,
        ReplyRequest request,
        PortfolioDbContext db,
        Updates.IEmailSender emails,
        Microsoft.Extensions.Options.IOptionsMonitor<Auth.AdminOptions> admins,
        Microsoft.Extensions.Options.IOptions<SiteOptions> site,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var text = request.Text?.Trim() ?? "";
        if (text.Length == 0 || text.Length > ReplyMaxLength)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["text"] = [text.Length == 0 ? "Write the reply first." : $"At most {ReplyMaxLength} characters."] });
        }

        var message = await db.ContactMessages.FindAsync([id], cancellationToken);
        if (message is null) return TypedResults.NotFound();

        // What they last wrote, quoted under the answer: their first message, or their latest reply.
        var lastFromThem = await db.ContactReplies.AsNoTracking()
            .Where(r => r.MessageId == id && r.FromVisitor)
            .OrderByDescending(r => r.SentAt).ThenByDescending(r => r.Id)
            .Select(r => r.Text)
            .FirstOrDefaultAsync(cancellationToken) ?? message.Message;
        var conversation = site.Value.UrlFor($"/contact/conversation?token={Uri.EscapeDataString(message.Token)}");
        try
        {
            await emails.SendAsync(Meetings.PersonalEmails.Reply(message.Email, message.Name, text, lastFromThem, admins.CurrentValue.AdminEmails.FirstOrDefault() ?? "", conversation), cancellationToken);
        }
        catch (Settings.ServiceException e)
        {
            return TypedResults.Problem(e.Message, statusCode: StatusCodes.Status503ServiceUnavailable);
        }
        catch (HttpRequestException)
        {
            return TypedResults.Problem("The email service couldn't be reached. Please try again.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var reply = new ContactReply { MessageId = id, Text = text, SentAt = time.GetUtcNow() };
        db.ContactReplies.Add(reply);
        message.ReadAt ??= reply.SentAt;
        message.LastActivityAt = reply.SentAt;
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(new ContactReplyDto(reply.Id, reply.Text, reply.SentAt, false));
    }

    /// <summary>Public, with the link. 404 for a link that matches no conversation (deleted since, or mistyped).</summary>
    public static async Task<Results<Ok<ConversationDto>, NotFound>> GetConversation(string token, PortfolioDbContext db, CancellationToken cancellationToken)
    {
        var message = await FindConversationAsync(db, token, tracked: false, cancellationToken);
        if (message is null) return TypedResults.NotFound();
        return TypedResults.Ok(await ConversationOfAsync(db, message, cancellationToken));
    }

    public const int WriteBackMaxLength = 2000;

    /// <summary>
    /// Public, with the link: the visitor writes back. Kept with the conversation, which turns unread and goes to the top
    /// of the inbox, and the admin's phone hears it. Answers with the whole conversation, as it now is.
    /// </summary>
    public static async Task<Results<Ok<ConversationDto>, NotFound, ValidationProblem>> WriteBack(
        string token,
        ReplyRequest request,
        PortfolioDbContext db,
        IPhoneAlerts alerts,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var text = request?.Text?.Trim() ?? "";
        if (text.Length == 0 || text.Length > WriteBackMaxLength)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["text"] = [text.Length == 0 ? "Write your message first." : $"At most {WriteBackMaxLength} characters."] });
        }

        var message = await FindConversationAsync(db, token, tracked: true, cancellationToken);
        if (message is null) return TypedResults.NotFound();

        var now = time.GetUtcNow();
        db.ContactReplies.Add(new ContactReply { MessageId = message.Id, Text = text, SentAt = now, FromVisitor = true });
        message.ReadAt = null;
        message.LastActivityAt = now;
        await db.SaveChangesAsync(cancellationToken);

        alerts.Send(new PhoneAlert(AlertKinds.Message, $"New reply from {message.Name}", text, "/contact", AlertPriority.High, "envelope"));
        return TypedResults.Ok(await ConversationOfAsync(db, message, cancellationToken));
    }

    private static async Task<ContactMessage?> FindConversationAsync(PortfolioDbContext db, string? token, bool tracked, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 100) return null;
        var messages = tracked ? db.ContactMessages : db.ContactMessages.AsNoTracking();
        return await messages.FirstOrDefaultAsync(m => m.Token == token.Trim(), cancellationToken);
    }

    private static async Task<ConversationDto> ConversationOfAsync(PortfolioDbContext db, ContactMessage message, CancellationToken cancellationToken)
    {
        var replies = await db.ContactReplies.AsNoTracking()
            .Where(r => r.MessageId == message.Id)
            .OrderBy(r => r.SentAt).ThenBy(r => r.Id)
            .Select(r => new ConversationMessage(r.Text, r.SentAt, r.FromVisitor))
            .ToListAsync(cancellationToken);
        return new ConversationDto(message.Name, [new ConversationMessage(message.Message, message.ReceivedAt, true), .. replies]);
    }

    /// <summary>Idempotent: keeps the time it was first read.</summary>
    public static async Task<Results<NoContent, NotFound>> MarkAsRead(
        int id,
        PortfolioDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var message = await db.ContactMessages.FindAsync([id], cancellationToken);
        if (message is null)
        {
            return TypedResults.NotFound();
        }

        if (message.ReadAt is null)
        {
            message.ReadAt = time.GetUtcNow();
            await db.SaveChangesAsync(cancellationToken);
        }

        return TypedResults.NoContent();
    }

    /// <summary>Deletes the message for good.</summary>
    public static async Task<Results<NoContent, NotFound>> DeleteMessage(
        int id,
        PortfolioDbContext db,
        CancellationToken cancellationToken)
    {
        var message = await db.ContactMessages.FindAsync([id], cancellationToken);
        if (message is null)
        {
            return TypedResults.NotFound();
        }

        db.ContactMessages.Remove(message);
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }
}
