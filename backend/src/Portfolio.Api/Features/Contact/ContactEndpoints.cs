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
/// <param name="Subject">The email's subject, for a conversation that started by email.</param>
public record ContactMessageDetails(int Id, string Name, string Email, string Message, DateTimeOffset ReceivedAt, DateTimeOffset? ReadAt, IReadOnlyList<ContactReplyDto> Replies, IReadOnlyList<Meetings.MeetingDto> Meetings, string? Subject = null);

/// <param name="FromVisitor">Emailed by the visitor; false for the admin's answers.</param>
public record ContactReplyDto(int Id, string Text, DateTimeOffset SentAt, bool FromVisitor);

public record ReplyRequest(string? Text);

public static class ContactEndpoints
{
    public const int DefaultPageSize = 10;
    public const int MaxPageSize = 50;

    /// <summary>The contact form, per IP (Contact:LimitPer10Minutes): nobody floods the inbox and the phone.</summary>
    public const string RateLimitPolicy = "contact";

    public static IEndpointRouteBuilder MapContactEndpoints(this IEndpointRouteBuilder app)
    {
        var contact = app.MapGroup("/contact");

        // Public: anyone can send a message.
        contact.MapPost("/", SendMessage).WithName("SendContactMessage").RequireRateLimiting(RateLimitPolicy);

        // Called by Resend for each email received, checked with the webhook's signature.
        contact.MapPost("/inbound", InboundEmail.Receive).WithName("ReceiveContactEmail");

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

        return TypedResults.Ok(new ContactMessageDetails(message.Id, message.Name, message.Email, message.Message, message.ReceivedAt, message.ReadAt, replies, meetings, message.Subject));
    }

    public const int ReplyMaxLength = 5000;

    /// <summary>
    /// Admin only. Emails an answer to whoever sent the message (Resend), from the site's address, with their last
    /// message quoted under it and in its thread; keeps it with the conversation. Their answer, emailed back, joins the
    /// conversation (<see cref="InboundEmail"/>). 503 when it can't be sent.
    /// </summary>
    public static async Task<Results<Ok<ContactReplyDto>, NotFound, ValidationProblem, ProblemHttpResult>> Reply(
        int id,
        ReplyRequest request,
        PortfolioDbContext db,
        Updates.IEmailSender emails,
        Microsoft.Extensions.Options.IOptionsMonitor<Auth.AdminOptions> admins,
        Microsoft.Extensions.Options.IOptionsMonitor<Updates.EmailOptions> emailOptions,
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

        // What they last wrote, quoted under the answer (and the thread it joins): their first message, or their latest reply.
        var lastFromThem = await db.ContactReplies.AsNoTracking()
            .Where(r => r.MessageId == id && r.FromVisitor)
            .OrderByDescending(r => r.SentAt).ThenByDescending(r => r.Id)
            .Select(r => new { r.Text, r.EmailMessageId })
            .FirstOrDefaultAsync(cancellationToken);
        var quoted = lastFromThem?.Text ?? message.Message;
        var thread = lastFromThem is null ? message.EmailMessageId : lastFromThem.EmailMessageId ?? message.EmailMessageId;
        try
        {
            var email = Meetings.PersonalEmails.Reply(message.Email, message.Name, text, quoted, message.Subject, ReplyToFor(emailOptions.CurrentValue, admins.CurrentValue), thread);
            await emails.SendAsync(email, cancellationToken);
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

    /// <summary>
    /// Where a visitor's answer to the admin's email goes: to the sender (the site's address, where it joins the
    /// conversation) once the site receives email; until then, to the admin's own address, so it isn't lost.
    /// </summary>
    public static string? ReplyToFor(Updates.EmailOptions email, Auth.AdminOptions admins) =>
        email.IsReceiving && email.FromAddress.Length > 0 ? null : admins.AdminEmails.FirstOrDefault();

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
