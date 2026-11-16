using System.Text;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Updates;
using static Portfolio.Api.Features.Meetings.MeetingsShared;

namespace Portfolio.Api.Features.Meetings;

/// <summary>
/// Cal.com's webhook (Settings → Developer → Webhooks). The body is signed: HMAC-SHA256 of it with
/// the webhook's secret, in hex, in x-cal-signature-256. Keeps each booking (by its uid) up to date
/// and alerts the phone: a request with Accept / Decline buttons, a booking, a move, a cancellation.
/// </summary>
public sealed class CalWebhook : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/meetings").MapPost("/cal", Handle).WithName("CalWebhook");

    public static async Task<Results<Ok, BadRequest, UnauthorizedHttpResult, ProblemHttpResult>> Handle(
        HttpRequest request,
        PortfolioDbContext db,
        IOptionsMonitor<CalOptions> options,
        IOptions<SiteOptions> site,
        IPhoneAlerts alerts,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var secret = options.CurrentValue.WebhookSecret.Trim();
        if (secret.Length == 0) return TypedResults.Problem("Cal.com isn't set up: set its webhook secret in Settings.", statusCode: StatusCodes.Status503ServiceUnavailable);

        if (await RequestBodies.ReadLimitedAsync(request, MaxWebhookBytes, cancellationToken) is not { } body) return TypedResults.BadRequest();
        if (!Support.SupportShared.SignatureMatches(body, request.Headers["x-cal-signature-256"].FirstOrDefault(), secret)) return TypedResults.Unauthorized();

        var booking = ParseCal(Encoding.UTF8.GetString(body));
        if (booking is null) return TypedResults.BadRequest();
        // Cal.com's "Ping test", and events this site doesn't use.
        if (booking.Status is null || booking.Uid is null) return TypedResults.Ok();

        var now = time.GetUtcNow();
        var meeting = await db.Meetings.FirstOrDefaultAsync(m => m.Uid == booking.Uid, cancellationToken);
        var previous = meeting?.Status;
        if (meeting is null)
        {
            meeting = new Meeting { Uid = booking.Uid, Title = "", AttendeeName = "", AttendeeEmail = "", Status = booking.Status, CreatedAt = now };
            db.Meetings.Add(meeting);
        }
        meeting.Title = Cut(booking.Title, 300) ?? "Meeting";
        // A meeting moved to another time gets its reminders again.
        if (booking.Start is { } start && start != meeting.StartTime)
        {
            meeting.RemindersSent = 0;
            meeting.StartTime = start;
        }
        if (booking.End is { } end) meeting.EndTime = end;
        meeting.AttendeeName = Cut(booking.AttendeeName, 200) ?? meeting.AttendeeName;
        meeting.AttendeeEmail = Cut(booking.AttendeeEmail, 320) ?? meeting.AttendeeEmail;
        meeting.AttendeeTimeZone = Cut(booking.AttendeeTimeZone, 64) ?? meeting.AttendeeTimeZone;
        meeting.Notes = Cut(booking.Notes, 2000) ?? meeting.Notes;
        meeting.Status = booking.Status;
        meeting.UpdatedAt = now;

        string? token = null;
        if (meeting.Status == MeetingStatus.Requested && previous != MeetingStatus.Requested)
        {
            token = UpdatesShared.NewToken();
            meeting.DecisionTokenHash = Hash(token);
        }
        if (meeting.Status != MeetingStatus.Requested) meeting.DecisionTokenHash = null;

        // A moved booking gets a new uid: the old one is gone.
        if (booking.RescheduledFromUid is { } oldUid && oldUid != booking.Uid)
        {
            var old = await db.Meetings.FirstOrDefaultAsync(m => m.Uid == oldUid, cancellationToken);
            if (old is not null)
            {
                old.Status = MeetingStatus.Cancelled;
                old.UpdatedAt = now;
            }
        }
        await db.SaveChangesAsync(cancellationToken);

        var when = PersonalEmails.FormatWhen(meeting.StartTime, site.Value.TimeZone);
        var who = meeting.AttendeeName.Length > 0 ? meeting.AttendeeName : meeting.AttendeeEmail;
        if (token is not null)
        {
            var url = (string action) => site.Value.UrlFor($"/api/meetings/{meeting.Id}/{action}?token={token}");
            var invited = await IsInvitedAsync(db, meeting.AttendeeEmail, cancellationToken);
            var details = $"{when}\n{meeting.Notes ?? meeting.Title}";
            alerts.Send(new PhoneAlert(AlertKinds.MeetingRequest, $"Meeting request: {who}", invited ? details : $"{NotFromConversation}\n{details}", "/contact", AlertPriority.High, "calendar",
                [new AlertAction("Accept", url("accept")), new AlertAction("Decline", url("decline"))]));
        }
        else if (previous != meeting.Status)
        {
            var title = meeting.Status switch
            {
                MeetingStatus.Accepted => booking.RescheduledFromUid is null ? $"Meeting booked: {who}" : $"Meeting moved: {who}",
                MeetingStatus.Cancelled => $"Meeting cancelled: {who}",
                MeetingStatus.Declined => $"Meeting declined: {who}",
                _ => $"Meeting: {who}",
            };
            // Booked straight away (the event type doesn't ask for confirmation) by someone who hasn't written: worth knowing.
            var stranger = previous is null && meeting.Status == MeetingStatus.Accepted && !await IsInvitedAsync(db, meeting.AttendeeEmail, cancellationToken);
            alerts.Send(new PhoneAlert(AlertKinds.MeetingChange, title, stranger ? $"{NotFromConversation}\n{when}" : when, "/contact", AlertPriority.Default, "calendar"));
        }
        return TypedResults.Ok();
    }
}
