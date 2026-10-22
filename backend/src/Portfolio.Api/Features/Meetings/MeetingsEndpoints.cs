using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Auth;
using Portfolio.Api.Features.Contact;
using Portfolio.Api.Features.Settings;
using Portfolio.Api.Features.Updates;

namespace Portfolio.Api.Features.Meetings;

public static class MeetingStatus
{
    /// <summary>Waits for the admin (the event type "requires confirmation").</summary>
    public const string Requested = "requested";

    public const string Accepted = "accepted";
    public const string Declined = "declined";
    public const string Cancelled = "cancelled";
}

/// <param name="CalLink">"username/event" for the booking page, or "" when meetings aren't offered.</param>
public record MeetingsInfo(string CalLink);

public record MeetingDto(int Id, string Title, DateTimeOffset StartTime, DateTimeOffset EndTime, string AttendeeName, string AttendeeEmail, string? AttendeeTimeZone, string? Notes, string Status);

/// <param name="Message">Emailed to the attendee with the decision (and, for a decline, given to Cal.com as the reason). Optional.</param>
public record MeetingDecisionRequest(string? Message);

/// <param name="EmailSent">False when there was a message but it couldn't be emailed (the decision still stands).</param>
public record MeetingDecisionResult(string Status, bool EmailSent);

/// <summary>Meetings booked with Cal.com: the webhook that reports them, the admin's calendar, and accepting or declining requests.</summary>
public static class MeetingsEndpoints
{
    public const int MessageMaxLength = 2000;

    public static IEndpointRouteBuilder MapMeetingsEndpoints(this IEndpointRouteBuilder app)
    {
        var meetings = app.MapGroup("/meetings");

        meetings.MapGet("/info", GetInfo).WithName("GetMeetingsInfo");
        // Called by Cal.com, checked with the webhook's signature.
        meetings.MapPost("/cal", CalWebhook).WithName("CalWebhook");

        meetings.MapGet("/", ListMeetings).WithName("ListMeetings").RequireAuthorization();
        // The admin (signed in, with an optional message), or the phone alert's buttons (with the meeting's token).
        meetings.MapPost("/{id:int}/accept", (int id, string? token, MeetingDecisionRequest? request, HttpContext http, PortfolioDbContext db, ICalClient cal, IEmailSender emails, IOptionsMonitor<AdminOptions> admins, IOptionsMonitor<EmailOptions> emailOptions, TimeProvider time, ILoggerFactory loggers, CancellationToken ct) =>
            Decide(id, token, true, request, http, db, cal, emails, admins, emailOptions, time, loggers, ct)).WithName("AcceptMeeting");
        meetings.MapPost("/{id:int}/decline", (int id, string? token, MeetingDecisionRequest? request, HttpContext http, PortfolioDbContext db, ICalClient cal, IEmailSender emails, IOptionsMonitor<AdminOptions> admins, IOptionsMonitor<EmailOptions> emailOptions, TimeProvider time, ILoggerFactory loggers, CancellationToken ct) =>
            Decide(id, token, false, request, http, db, cal, emails, admins, emailOptions, time, loggers, ct)).WithName("DeclineMeeting");

        return app;
    }

    /// <summary>Public. Where "Book a meeting" books, or "" to hide it (no page set, or switched off in Settings).</summary>
    public static async Task<Ok<MeetingsInfo>> GetInfo(IOptionsMonitor<CalOptions> options, Microsoft.Extensions.Caching.Hybrid.HybridCache cache, IServiceProvider services, CancellationToken cancellationToken)
    {
        var site = await Site.SiteEndpoints.LoadAsync(cache, services, cancellationToken);
        return TypedResults.Ok(new MeetingsInfo(site.Features["meetings"] ? CalOptions.NormalizeLink(options.CurrentValue.Link) : ""));
    }

    /// <summary>
    /// Cal.com's webhook (Settings → Developer → Webhooks). The body is signed: HMAC-SHA256 of it with
    /// the webhook's secret, in hex, in x-cal-signature-256. Keeps each booking (by its uid) up to date
    /// and alerts the phone: a request with Accept / Decline buttons, a booking, a move, a cancellation.
    /// </summary>
    public static async Task<Results<Ok, BadRequest, UnauthorizedHttpResult, ProblemHttpResult>> CalWebhook(
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

        using var buffer = new MemoryStream();
        await request.Body.CopyToAsync(buffer, cancellationToken);
        if (buffer.Length > 256 * 1024) return TypedResults.BadRequest();
        var body = buffer.ToArray();
        if (!Support.SupportEndpoints.SignatureMatches(body, request.Headers["x-cal-signature-256"].FirstOrDefault(), secret)) return TypedResults.Unauthorized();

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
            token = UpdatesEndpoints.NewToken();
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
            alerts.Send(new PhoneAlert(AlertKinds.MeetingRequest, $"Meeting request: {who}", $"{when}\n{meeting.Notes ?? meeting.Title}", "/contact", AlertPriority.High, "calendar",
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
            alerts.Send(new PhoneAlert(AlertKinds.MeetingChange, title, when, "/contact", AlertPriority.Default, "calendar"));
        }
        return TypedResults.Ok();
    }

    /// <summary>What the site reads from a Cal.com webhook; null when it isn't JSON.</summary>
    public record CalBooking(string? Uid, string? Status, string? Title, DateTimeOffset? Start, DateTimeOffset? End, string? AttendeeName, string? AttendeeEmail, string? AttendeeTimeZone, string? Notes, string? RescheduledFromUid);

    /// <summary>
    /// Reads { triggerEvent, payload: { uid, title, startTime, endTime, attendees: [{ name, email, timeZone }],
    /// responses: { notes: { value } }, status, rescheduleUid } }. The status comes from the event
    /// (booking requested, created, rescheduled, cancelled, rejected), else from the payload's own;
    /// other events (and Cal.com's ping) get none, and are ignored.
    /// </summary>
    public static CalBooking? ParseCal(string json)
    {
        JsonObject? root;
        try
        {
            root = JsonNode.Parse(json) as JsonObject;
        }
        catch (JsonException)
        {
            return null;
        }
        if (root is null) return null;

        var payload = root["payload"] as JsonObject ?? root;
        var attendee = (payload["attendees"] as JsonArray)?.FirstOrDefault() as JsonObject;
        var trigger = Text(root["triggerEvent"]);
        var status = trigger switch
        {
            "BOOKING_REQUESTED" => MeetingStatus.Requested,
            "BOOKING_CREATED" or "BOOKING_RESCHEDULED" => FromCalStatus(Text(payload["status"])) ?? MeetingStatus.Accepted,
            "BOOKING_CANCELLED" => MeetingStatus.Cancelled,
            "BOOKING_REJECTED" => MeetingStatus.Declined,
            _ => null,
        };
        var responses = payload["responses"] as JsonObject;
        var notes = responses?["notes"] is JsonObject notesField ? Text(notesField["value"]) : Text(responses?["notes"]) ?? Text(payload["additionalNotes"]);

        return new CalBooking(
            Text(payload["uid"]),
            status,
            Text(payload["title"]),
            Time(payload["startTime"]),
            Time(payload["endTime"]),
            attendee is null ? null : Text(attendee["name"]),
            attendee is null ? null : Text(attendee["email"]),
            attendee is null ? null : Text(attendee["timeZone"]),
            notes,
            Text(payload["rescheduleUid"]) ?? Text(payload["fromReschedule"]));
    }

    private static string? FromCalStatus(string? status) => status?.ToUpperInvariant() switch
    {
        "ACCEPTED" => MeetingStatus.Accepted,
        "PENDING" => MeetingStatus.Requested,
        "CANCELLED" => MeetingStatus.Cancelled,
        "REJECTED" => MeetingStatus.Declined,
        _ => null,
    };

    /// <summary>Admin only. Meetings that overlap [from, to) (a calendar month), soonest first; by default the next 60 days.</summary>
    public static async Task<Ok<IReadOnlyList<MeetingDto>>> ListMeetings(PortfolioDbContext db, TimeProvider time, CancellationToken cancellationToken, DateTimeOffset? from = null, DateTimeOffset? to = null)
    {
        var start = from ?? time.GetUtcNow().AddDays(-1);
        var end = to ?? start.AddDays(61);
        var meetings = await db.Meetings.AsNoTracking()
            .Where(m => m.StartTime < end && m.EndTime >= start)
            .OrderBy(m => m.StartTime)
            .Select(m => new MeetingDto(m.Id, m.Title, m.StartTime, m.EndTime, m.AttendeeName, m.AttendeeEmail, m.AttendeeTimeZone, m.Notes, m.Status))
            .ToListAsync(cancellationToken);
        return TypedResults.Ok<IReadOnlyList<MeetingDto>>(meetings);
    }

    /// <summary>
    /// Accepts or declines a requested meeting with Cal.com (which tells the attendee), then emails them
    /// the admin's message, if there is one. Allowed for the signed-in admin, or with the token from
    /// its alert. Deciding again answers with how it was decided.
    /// </summary>
    public static async Task<Results<Ok<MeetingDecisionResult>, NotFound, UnauthorizedHttpResult, ValidationProblem, ProblemHttpResult>> Decide(
        int id,
        string? token,
        bool accept,
        MeetingDecisionRequest? request,
        HttpContext http,
        PortfolioDbContext db,
        ICalClient cal,
        IEmailSender emails,
        IOptionsMonitor<AdminOptions> admins,
        IOptionsMonitor<EmailOptions> emailOptions,
        TimeProvider time,
        ILoggerFactory loggers,
        CancellationToken cancellationToken)
    {
        var meeting = await db.Meetings.FindAsync([id], cancellationToken);
        if (meeting is null) return TypedResults.NotFound();

        var isAdmin = http.User.Identity?.IsAuthenticated == true;
        var tokenOk = meeting.DecisionTokenHash is { } hash && !string.IsNullOrEmpty(token) && CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(hash), Encoding.ASCII.GetBytes(Hash(token)));
        if (!isAdmin && !tokenOk) return TypedResults.Unauthorized();

        var message = isAdmin ? request?.Message?.Trim() ?? "" : "";
        if (message.Length > MessageMaxLength) return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["message"] = [$"At most {MessageMaxLength} characters."] });
        if (meeting.Status != MeetingStatus.Requested) return TypedResults.Ok(new MeetingDecisionResult(meeting.Status, false));

        try
        {
            if (accept) await cal.ConfirmAsync(meeting.Uid, cancellationToken);
            else await cal.DeclineAsync(meeting.Uid, message.Length > 0 ? message : null, cancellationToken);
        }
        catch (ServiceException e)
        {
            return TypedResults.Problem(e.Message, statusCode: StatusCodes.Status502BadGateway);
        }

        meeting.Status = accept ? MeetingStatus.Accepted : MeetingStatus.Declined;
        meeting.DecisionTokenHash = null;
        meeting.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);

        var emailSent = false;
        if (message.Length > 0 && meeting.AttendeeEmail.Length > 0)
        {
            try
            {
                await emails.SendAsync(PersonalEmails.MeetingNote(meeting.AttendeeEmail, meeting.AttendeeName, accept, meeting.StartTime, meeting.AttendeeTimeZone, message, ContactEndpoints.ReplyToFor(emailOptions.CurrentValue, admins.CurrentValue)), cancellationToken);
                emailSent = true;
            }
            catch (Exception e) when (!cancellationToken.IsCancellationRequested)
            {
                loggers.CreateLogger(typeof(MeetingsEndpoints)).LogWarning(e, "Couldn't email the note about meeting {Id}.", id);
            }
        }
        return TypedResults.Ok(new MeetingDecisionResult(meeting.Status, emailSent));
    }

    public static string Hash(string token) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static string? Text(JsonNode? node) => node is JsonValue value && value.TryGetValue<string>(out var s) && s.Trim().Length > 0 ? s.Trim() : null;

    private static DateTimeOffset? Time(JsonNode? node) =>
        Text(node) is { } text && DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var value) ? value : null;

    private static string? Cut(string? text, int max) => text is null ? null : text.Length <= max ? text : text[..max];
}
