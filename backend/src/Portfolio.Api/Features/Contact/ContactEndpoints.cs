using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;

namespace Portfolio.Api.Features.Contact;

/// <summary>Body of the public contact form. Nullable so missing fields become validation errors, not 400s without details.</summary>
public record SendMessageRequest(string? Name, string? Email, string? Message);

public record ContactMessageSummary(int Id, string Name, DateTimeOffset ReceivedAt, bool IsRead);

/// <param name="Replies">What the admin answered, oldest first.</param>
/// <param name="Meetings">Meetings the same address booked with Cal.com (not cancelled), soonest first: to accept or decline from the message.</param>
public record ContactMessageDetails(int Id, string Name, string Email, string Message, DateTimeOffset ReceivedAt, DateTimeOffset? ReadAt, IReadOnlyList<ContactReplyDto> Replies, IReadOnlyList<Meetings.MeetingDto> Meetings);

public record ContactReplyDto(int Id, string Text, DateTimeOffset SentAt);

public record ReplyRequest(string? Text);

public static class ContactEndpoints
{
    public const int DefaultPageSize = 10;
    public const int MaxPageSize = 50;

    public static IEndpointRouteBuilder MapContactEndpoints(this IEndpointRouteBuilder app)
    {
        var contact = app.MapGroup("/contact");

        // Public: anyone can send a message.
        contact.MapPost("/", SendMessage).WithName("SendContactMessage");

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
        db.ContactMessages.Add(message);
        await db.SaveChangesAsync(cancellationToken);

        alerts.Send(new PhoneAlert($"New message from {message.Name}", message.Message, "/contact", AlertPriority.High, "envelope"));

        return TypedResults.Created();
    }

    /// <summary>Newest first. Out-of-range pages return no items (with the real total).</summary>
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
            .OrderByDescending(m => m.ReceivedAt)
            .ThenByDescending(m => m.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(m => new ContactMessageSummary(m.Id, m.Name, m.ReceivedAt, m.ReadAt != null))
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
            .Select(r => new ContactReplyDto(r.Id, r.Text, r.SentAt))
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
    /// Admin only. Emails an answer to whoever sent the message (Resend), with the admin's own address
    /// to reply to and the message quoted under it, and keeps it with the message. 503 when it can't be sent.
    /// </summary>
    public static async Task<Results<Ok<ContactReplyDto>, NotFound, ValidationProblem, ProblemHttpResult>> Reply(
        int id,
        ReplyRequest request,
        PortfolioDbContext db,
        Updates.IEmailSender emails,
        Microsoft.Extensions.Options.IOptionsMonitor<Auth.AdminOptions> admins,
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

        try
        {
            await emails.SendAsync(Meetings.PersonalEmails.Reply(message.Email, message.Name, text, message.Message, admins.CurrentValue.AdminEmails.FirstOrDefault() ?? ""), cancellationToken);
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
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(new ContactReplyDto(reply.Id, reply.Text, reply.SentAt));
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
