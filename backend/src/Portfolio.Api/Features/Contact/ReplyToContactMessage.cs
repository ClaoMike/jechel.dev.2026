using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Contact.ContactShared;

namespace Portfolio.Api.Features.Contact;

/// <summary>
/// Admin only. Emails an answer to whoever sent the message (Resend), from the site's address, with their last
/// message quoted under it and in its thread; keeps it with the conversation. Their answer, emailed back, joins the
/// conversation (<see cref="InboundEmail"/>). 503 when it can't be sent.
/// </summary>
public sealed class ReplyToContactMessage : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/contact").MapGroup("/messages").RequireAuthorization().MapPost("/{id:int}/reply", Handle).WithName("ReplyToContactMessage");

    public static async Task<Results<Ok<ContactReplyDto>, NotFound, ValidationProblem, ProblemHttpResult>> Handle(
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
}
