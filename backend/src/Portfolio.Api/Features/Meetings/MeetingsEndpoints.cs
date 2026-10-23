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

/// <param name="BookingUrl">The Cal.com booking page, e.g. "https://cal.com/claomike/30min", or "" when none is set.</param>
public record MeetingsInfo(string BookingUrl);

/// <param name="FromConversation">Booked by someone who has written to the site (a conversation with their address): an invited guest. False for a stranger who found the link.</param>
public record MeetingDto(int Id, string Title, DateTimeOffset StartTime, DateTimeOffset EndTime, string AttendeeName, string AttendeeEmail, string? AttendeeTimeZone, string? Notes, string Status, bool FromConversation = true);

/// <param name="Message">Emailed to the attendee with the decision (and, for a decline, given to Cal.com as the reason). Optional.</param>
public record MeetingDecisionRequest(string? Message);

/// <param name="EmailSent">False when there was a message but it couldn't be emailed (the decision still stands).</param>
public record MeetingDecisionResult(string Status, bool EmailSent);

/// <summary>
/// Meetings booked with Cal.com, by invitation only: the admin sends the booking link in an answer to a conversation
/// (the page itself is hidden on Cal.com). The webhook that reports them, the admin's calendar, and accepting or declining
/// requests; a request from someone with no conversation is marked as such.
/// </summary>
public static class MeetingsEndpoints
{
    public const int MessageMaxLength = 2000;

    /// <summary>A booking's webhook is a few kilobytes: anything this big isn't Cal.com's.</summary>
    public const int MaxWebhookBytes = 256 * 1024;

    public static IEndpointRouteBuilder MapMeetingsEndpoints(this IEndpointRouteBuilder app)
    {
        var meetings = app.MapGroup("/meetings");

        meetings.MapGet("/info", GetInfo).WithName("GetMeetingsInfo").RequireAuthorization();
        // Called by Cal.com, checked with the webhook's signature.
        meetings.MapPost("/cal", CalWebhook).WithName("CalWebhook");

        meetings.MapGet("/", ListMeetings).WithName("ListMeetings").RequireAuthorization();
        // The admin (signed in, with an optional message), or the phone alert's buttons (with the meeting's token).
        meetings.MapPost("/{id:int}/accept", (int id, string? token, MeetingDecisionRequest? request, HttpContext http, PortfolioDbContext db, ICalClient cal, IEmailSender emails, IOptionsMonitor<AdminOptions> admins, IOptionsMonitor<EmailOptions> emailOptions, TimeProvider time, ILoggerFactory loggers, CancellationToken ct) =>
            Decide(id, token, true, request, http, db, cal, emails, admins, emailOptions, time, loggers, ct)).WithName("AcceptMeeting");
        meetings.MapPost("/{id:int}/decline", (int id, string? token, MeetingDecisionRequest? request, HttpContext http, PortfolioDbContext db, ICalClient cal, IEmailSender emails, IOptionsMonitor<AdminOptions> admins, IOptionsMonitor<EmailOptions> emailOptions, TimeProvider time, ILoggerFactory loggers, CancellationToken ct) =>
            Decide(id, token, false, request, http, db, cal, emails, admins, emailOptions, time, loggers, ct)).WithName("DeclineMeeting");
        meetings.MapPost("/{id:int}/cancel", Cancel).WithName("CancelMeeting").RequireAuthorization();

        return app;
    }

    /// <summary>Admin only. The booking link to send in an answer, or "" when no booking page is set.</summary>
    public static Ok<MeetingsInfo> GetInfo(IOptionsMonitor<CalOptions> options) => TypedResults.Ok(new MeetingsInfo(options.CurrentValue.BookingUrl));

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

        if (await RequestBodies.ReadLimitedAsync(request, MaxWebhookBytes, cancellationToken) is not { } body) return TypedResults.BadRequest();
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

    /// <summary>On a request from someone who hasn't written to the site: the link was passed on, or found.</summary>
    public const string NotFromConversation = "Not from a conversation";

    /// <summary>Whether this address has a conversation in the Contact inbox (any case).</summary>
    public static Task<bool> IsInvitedAsync(PortfolioDbContext db, string email, CancellationToken cancellationToken)
    {
        var address = email.Trim().ToLower();
        return db.ContactMessages.AnyAsync(c => c.Email.ToLower() == address, cancellationToken);
    }

    /// <summary>Admin only. Meetings that overlap [from, to) (a calendar month), soonest first; by default the next 60 days.</summary>
    public static async Task<Ok<IReadOnlyList<MeetingDto>>> ListMeetings(PortfolioDbContext db, TimeProvider time, CancellationToken cancellationToken, DateTimeOffset? from = null, DateTimeOffset? to = null)
    {
        var start = from ?? time.GetUtcNow().AddDays(-1);
        var end = to ?? start.AddDays(61);
        var meetings = await db.Meetings.AsNoTracking()
            .Where(m => m.StartTime < end && m.EndTime >= start)
            .OrderBy(m => m.StartTime)
            .Select(m => new MeetingDto(m.Id, m.Title, m.StartTime, m.EndTime, m.AttendeeName, m.AttendeeEmail, m.AttendeeTimeZone, m.Notes, m.Status,
                db.ContactMessages.Any(c => c.Email.ToLower() == m.AttendeeEmail.ToLower())))
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
        catch (Exception e) when (CalFailed(e, cancellationToken))
        {
            return TypedResults.Problem(CalFailure(e), statusCode: StatusCodes.Status502BadGateway);
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

    /// <summary>Said to Cal.com when the admin gives no reason (it needs one from a host); it's in Cal.com's email.</summary>
    public const string DefaultCancelReason = "The meeting was cancelled by the organiser.";

    /// <summary>
    /// Admin only. Cancels an accepted meeting that hasn't ended with Cal.com, which emails the attendee (with the
    /// message as the reason). Its webhook then finds it cancelled already, so the phone isn't told about it.
    /// Cancelling again, or a meeting that isn't accepted, answers with its status.
    /// </summary>
    public static async Task<Results<Ok<MeetingDecisionResult>, NotFound, ValidationProblem, ProblemHttpResult>> Cancel(
        int id,
        MeetingDecisionRequest? request,
        PortfolioDbContext db,
        ICalClient cal,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var meeting = await db.Meetings.FindAsync([id], cancellationToken);
        if (meeting is null) return TypedResults.NotFound();

        var reason = request?.Message?.Trim() ?? "";
        if (reason.Length > MessageMaxLength) return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["message"] = [$"At most {MessageMaxLength} characters."] });
        if (meeting.Status != MeetingStatus.Accepted) return TypedResults.Ok(new MeetingDecisionResult(meeting.Status, false));
        if (meeting.EndTime <= time.GetUtcNow()) return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["meeting"] = ["It's over already."] });

        // Marked first: Cal.com's webhook for it can come back before its answer does, and must find it cancelled
        // already (or the phone hears of it). Put back if Cal.com refuses.
        var updatedAt = meeting.UpdatedAt;
        meeting.Status = MeetingStatus.Cancelled;
        meeting.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);
        var cancelled = false;
        try
        {
            await cal.CancelAsync(meeting.Uid, reason.Length > 0 ? reason : DefaultCancelReason, cancellationToken);
            cancelled = true;
        }
        catch (Exception e) when (CalFailed(e, cancellationToken))
        {
            return TypedResults.Problem(CalFailure(e), statusCode: StatusCodes.Status502BadGateway);
        }
        finally
        {
            // Whatever went wrong. (Should Cal.com have cancelled it anyway, an answer lost on the way, it's cancelled there.)
            if (!cancelled)
            {
                meeting.Status = MeetingStatus.Accepted;
                meeting.UpdatedAt = updatedAt;
                await db.SaveChangesAsync(CancellationToken.None);
            }
        }
        return TypedResults.Ok(new MeetingDecisionResult(meeting.Status, true));
    }

    /// <summary>Cal.com refused, or couldn't be reached: the admin is told (502), it's not a crash.</summary>
    private static bool CalFailed(Exception e, CancellationToken cancellationToken) =>
        e is ServiceException || (e is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested);

    private static string CalFailure(Exception e) => e is ServiceException ? e.Message : "Cal.com couldn't be reached.";

    public static string Hash(string token) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static string? Text(JsonNode? node) => node is JsonValue value && value.TryGetValue<string>(out var s) && s.Trim().Length > 0 ? s.Trim() : null;

    private static DateTimeOffset? Time(JsonNode? node) =>
        Text(node) is { } text && DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var value) ? value : null;

    private static string? Cut(string? text, int max) => text is null ? null : text.Length <= max ? text : text[..max];
}
