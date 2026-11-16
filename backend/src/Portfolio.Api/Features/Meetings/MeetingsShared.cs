using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;
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
public static class MeetingsShared
{
    public const int MessageMaxLength = 2000;

    /// <summary>A booking's webhook is a few kilobytes: anything this big isn't Cal.com's.</summary>
    public const int MaxWebhookBytes = 256 * 1024;

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

    internal static string? FromCalStatus(string? status) => status?.ToUpperInvariant() switch
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
                await emails.SendAsync(PersonalEmails.MeetingNote(meeting.AttendeeEmail, meeting.AttendeeName, accept, meeting.StartTime, meeting.AttendeeTimeZone, message, ContactShared.ReplyToFor(emailOptions.CurrentValue, admins.CurrentValue)), cancellationToken);
                emailSent = true;
            }
            catch (Exception e) when (!cancellationToken.IsCancellationRequested)
            {
                loggers.CreateLogger(typeof(MeetingsShared)).LogWarning(e, "Couldn't email the note about meeting {Id}.", id);
            }
        }
        return TypedResults.Ok(new MeetingDecisionResult(meeting.Status, emailSent));
    }

    /// <summary>Said to Cal.com when the admin gives no reason (it needs one from a host); it's in Cal.com's email.</summary>
    public const string DefaultCancelReason = "The meeting was cancelled by the organiser.";

    /// <summary>Cal.com refused, or couldn't be reached: the admin is told (502), it's not a crash.</summary>
    internal static bool CalFailed(Exception e, CancellationToken cancellationToken) =>
        e is ServiceException || (e is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested);

    internal static string CalFailure(Exception e) => e is ServiceException ? e.Message : "Cal.com couldn't be reached.";

    public static string Hash(string token) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    internal static string? Text(JsonNode? node) => node is JsonValue value && value.TryGetValue<string>(out var s) && s.Trim().Length > 0 ? s.Trim() : null;

    internal static DateTimeOffset? Time(JsonNode? node) =>
        Text(node) is { } text && DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var value) ? value : null;

    internal static string? Cut(string? text, int max) => text is null ? null : text.Length <= max ? text : text[..max];
}
