using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Contact;

/// <summary>Reading the details does not mark the message as read; the viewer calls <see cref="MarkAsRead"/>.</summary>
public sealed class GetContactMessage : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/contact").MapGroup("/messages").RequireAuthorization().MapGet("/{id:int}", Handle).WithName("GetContactMessage");

    public static async Task<Results<Ok<ContactMessageDetails>, NotFound>> Handle(
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
}
