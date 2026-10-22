using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Auth;
using Portfolio.Api.Features.Meetings;
using Portfolio.Api.Features.Settings;
using Portfolio.Api.UnitTests.Features.Alerts;
using Portfolio.Api.UnitTests.Features.Updates;

namespace Portfolio.Api.UnitTests.Features.Meetings;

public sealed class FakeCalClient : ICalClient
{
    public List<string> Calls { get; } = [];
    public ServiceException? Refuse { get; set; }

    public Task ConfirmAsync(string uid, CancellationToken cancellationToken) => Record($"confirm {uid}");
    public Task DeclineAsync(string uid, string? reason, CancellationToken cancellationToken) => Record($"decline {uid} {reason}".TrimEnd());
    public Task<string> WhoAmIAsync(CancellationToken cancellationToken) => Task.FromResult("claomike");

    private Task Record(string call)
    {
        if (Refuse is not null) throw Refuse;
        Calls.Add(call);
        return Task.CompletedTask;
    }
}

public class MeetingsTests
{
    private const string Secret = "cal-secret";
    private static readonly DateTimeOffset Now = new(2026, 10, 20, 9, 0, 0, TimeSpan.Zero);

    private readonly FakeTimeProvider _time = new(Now);
    private readonly FakePhoneAlerts _alerts = new();
    private readonly FakeCalClient _cal = new();
    private readonly FakeEmailSender _emails = new();
    private readonly PortfolioDbContext _db = new(new DbContextOptionsBuilder<PortfolioDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    private static string Booking(string trigger, string uid = "b1", string start = "2026-10-22T14:00:00Z", string? extra = null) =>
        "{\"triggerEvent\":\"" + trigger + "\",\"createdAt\":\"2026-10-20T09:00:00Z\",\"payload\":{\"uid\":\"" + uid + "\",\"title\":\"30 min with Ada\",\"startTime\":\"" + start
        + "\",\"endTime\":\"2026-10-22T14:30:00Z\",\"attendees\":[{\"name\":\"Ada\",\"email\":\"ada@example.com\",\"timeZone\":\"Europe/London\"}],"
        + "\"responses\":{\"notes\":{\"label\":\"Notes\",\"value\":\"About a website\"}}" + extra + "}}";

    private static HttpRequest Request(string body, string secret = Secret)
    {
        var context = new DefaultHttpContext();
        var bytes = Encoding.UTF8.GetBytes(body);
        context.Request.Body = new MemoryStream(bytes);
        context.Request.Headers["x-cal-signature-256"] = Convert.ToHexStringLower(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), bytes));
        return context.Request;
    }

    private Task<Results<Ok, BadRequest, UnauthorizedHttpResult, ProblemHttpResult>> Webhook(string body, string secret = Secret) =>
        MeetingsEndpoints.CalWebhook(Request(body, secret), _db, TestOptions.Monitor(new CalOptions { WebhookSecret = Secret }), Options.Create(new SiteOptions { PublicUrl = "https://jechel.dev" }), _alerts, _time, default);

    private Task<Results<Ok<MeetingDecisionResult>, NotFound, UnauthorizedHttpResult, ValidationProblem, ProblemHttpResult>> Decide(int id, bool accept, string? message = null, string? token = null, bool admin = true) =>
        MeetingsEndpoints.Decide(id, token, accept, new MeetingDecisionRequest(message), Http(admin), _db, _cal, _emails, TestOptions.Monitor(new AdminOptions { AdminEmails = ["me@example.com"] }), _time, Microsoft.Extensions.Logging.Abstractions.NullLoggerFactory.Instance, default);

    private static HttpContext Http(bool admin)
    {
        return new DefaultHttpContext
        {
            User = admin ? new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Email, "me@example.com")], "Cookies")) : new ClaimsPrincipal(new ClaimsIdentity()),
        };
    }

    [Fact]
    public async Task A_request_is_stored_and_alerts_the_phone_with_accept_and_decline()
    {
        Assert.IsType<Ok>((await Webhook(Booking("BOOKING_REQUESTED"))).Result);

        var meeting = await _db.Meetings.SingleAsync();
        Assert.Equal(("b1", MeetingStatus.Requested, "Ada", "ada@example.com", "About a website"), (meeting.Uid, meeting.Status, meeting.AttendeeName, meeting.AttendeeEmail, meeting.Notes));
        Assert.Equal(new DateTimeOffset(2026, 10, 22, 14, 0, 0, TimeSpan.Zero), meeting.StartTime);
        var alert = Assert.Single(_alerts.Sent);
        Assert.Equal("Meeting request: Ada", alert.Title);
        Assert.StartsWith("Thu 22 Oct, 15:00 (Europe/London)", alert.Message);
        Assert.Equal(["Accept", "Decline"], alert.Actions!.Select(a => a.Label));
        Assert.StartsWith($"https://jechel.dev/api/meetings/{meeting.Id}/accept?token=", alert.Actions![0].Url);
    }

    [Fact]
    public async Task A_bad_signature_is_refused_and_a_ping_is_fine()
    {
        Assert.IsType<UnauthorizedHttpResult>((await Webhook(Booking("BOOKING_REQUESTED"), secret: "guess")).Result);
        Assert.IsType<Ok>((await Webhook("""{"triggerEvent":"PING","payload":{}}""")).Result);
        Assert.Empty(_db.Meetings);
    }

    [Fact]
    public async Task Bookings_follow_cancellations_and_moves()
    {
        await Webhook(Booking("BOOKING_CREATED"));
        await Webhook(Booking("BOOKING_RESCHEDULED", uid: "b2", start: "2026-10-23T10:00:00Z", extra: ""","rescheduleUid":"b1" """));
        await Webhook(Booking("BOOKING_CANCELLED", uid: "b2"));

        var meetings = await _db.Meetings.OrderBy(m => m.Id).ToListAsync();
        Assert.Equal([("b1", MeetingStatus.Cancelled), ("b2", MeetingStatus.Cancelled)], meetings.Select(m => (m.Uid, m.Status)));
        Assert.Equal(["Meeting booked: Ada", "Meeting moved: Ada", "Meeting cancelled: Ada"], _alerts.Sent.Select(a => a.Title));
    }

    [Fact]
    public async Task The_admin_accepts_with_a_note_that_is_emailed()
    {
        await Webhook(Booking("BOOKING_REQUESTED"));
        var id = _db.Meetings.Single().Id;

        var result = await Decide(id, accept: true, message: "Looking forward to it!");

        Assert.Equal(new MeetingDecisionResult(MeetingStatus.Accepted, true), Assert.IsType<Ok<MeetingDecisionResult>>(result.Result).Value);
        Assert.Equal(["confirm b1"], _cal.Calls);
        var email = Assert.Single(_emails.Sent);
        Assert.Equal(("ada@example.com", "me@example.com"), (email.To, email.ReplyTo));
        Assert.Contains("Looking forward to it!", email.Text);
    }

    [Fact]
    public async Task Declining_gives_Cal_com_the_reason()
    {
        await Webhook(Booking("BOOKING_REQUESTED"));

        await Decide(_db.Meetings.Single().Id, accept: false, message: "I'm away that week.");

        Assert.Equal(["decline b1 I'm away that week."], _cal.Calls);
        Assert.Equal(MeetingStatus.Declined, _db.Meetings.Single().Status);
    }

    [Fact]
    public async Task The_phone_needs_the_alert_token_and_a_decision_is_final()
    {
        await Webhook(Booking("BOOKING_REQUESTED"));
        var id = _db.Meetings.Single().Id;
        var token = _alerts.Sent.Single().Actions![0].Url.Split("token=")[1];

        Assert.IsType<UnauthorizedHttpResult>((await Decide(id, true, admin: false, token: "guess")).Result);
        Assert.IsType<Ok<MeetingDecisionResult>>((await Decide(id, true, admin: false, token: token)).Result);
        Assert.Equal(MeetingStatus.Accepted, Assert.IsType<Ok<MeetingDecisionResult>>((await Decide(id, false)).Result).Value!.Status);
        Assert.Equal(["confirm b1"], _cal.Calls);
    }

    [Fact]
    public async Task When_Cal_com_refuses_the_meeting_stays_requested_and_the_admin_hears_why()
    {
        await Webhook(Booking("BOOKING_REQUESTED"));
        _cal.Refuse = new ServiceException("Cal.com refused it: invalid API key");

        var result = await Decide(_db.Meetings.Single().Id, true);

        Assert.Equal("Cal.com refused it: invalid API key", Assert.IsType<ProblemHttpResult>(result.Result).ProblemDetails.Detail);
        Assert.Equal(MeetingStatus.Requested, _db.Meetings.Single().Status);
    }

    [Fact]
    public async Task Without_a_webhook_secret_Cal_com_is_told_it_isnt_set_up()
    {
        var result = await MeetingsEndpoints.CalWebhook(Request(Booking("BOOKING_REQUESTED")), _db, TestOptions.Monitor(new CalOptions { WebhookSecret = "  " }), Options.Create(new SiteOptions()), _alerts, _time, default);

        Assert.Equal(StatusCodes.Status503ServiceUnavailable, Assert.IsType<ProblemHttpResult>(result.Result).StatusCode);
        Assert.Empty(_db.Meetings);
    }

    [Fact]
    public async Task A_missing_signature_or_a_body_that_isnt_JSON_is_refused()
    {
        var unsigned = Request(Booking("BOOKING_REQUESTED"));
        unsigned.Headers.Remove("x-cal-signature-256");
        Assert.IsType<UnauthorizedHttpResult>((await MeetingsEndpoints.CalWebhook(unsigned, _db, TestOptions.Monitor(new CalOptions { WebhookSecret = Secret }), Options.Create(new SiteOptions()), _alerts, _time, default)).Result);

        Assert.IsType<BadRequest>((await Webhook("not json")).Result);
        Assert.IsType<BadRequest>((await Webhook("[1,2]")).Result);
        Assert.IsType<BadRequest>((await Webhook("{\"payload\":" + new string(' ', 256 * 1024) + "{}}")).Result);
        Assert.Empty(_db.Meetings);
        Assert.Empty(_alerts.Sent);
    }

    [Fact]
    public async Task Events_the_site_doesnt_use_are_ignored()
    {
        Assert.IsType<Ok>((await Webhook(Booking("MEETING_ENDED"))).Result);
        Assert.IsType<Ok>((await Webhook("""{"triggerEvent":"BOOKING_REQUESTED","payload":{"title":"No uid"}}""")).Result);

        Assert.Empty(_db.Meetings);
        Assert.Empty(_alerts.Sent);
    }

    [Fact]
    public async Task Cal_com_sending_the_same_request_again_alerts_once_and_keeps_the_buttons_working()
    {
        await Webhook(Booking("BOOKING_REQUESTED"));
        var token = _alerts.Sent.Single().Actions![0].Url.Split("token=")[1];

        await Webhook(Booking("BOOKING_REQUESTED"));

        Assert.Single(_alerts.Sent);
        Assert.Single(_db.Meetings);
        Assert.IsType<Ok<MeetingDecisionResult>>((await Decide(_db.Meetings.Single().Id, true, admin: false, token: token)).Result);
    }

    [Fact]
    public async Task A_booking_that_needed_no_confirmation_alerts_without_buttons_and_isnt_decidable_by_phone()
    {
        await Webhook(Booking("BOOKING_CREATED"));

        var meeting = _db.Meetings.Single();
        Assert.Equal(MeetingStatus.Accepted, meeting.Status);
        Assert.Null(meeting.DecisionTokenHash);
        var alert = Assert.Single(_alerts.Sent);
        Assert.Equal((AlertKinds.MeetingChange, AlertPriority.Default, "/contact"), (alert.Kind, alert.Priority, alert.Path));
        Assert.Null(alert.Actions);
    }

    [Fact]
    public async Task The_request_alert_is_urgent_names_its_kind_and_shows_what_they_wrote()
    {
        await Webhook(Booking("BOOKING_REQUESTED"));

        var alert = _alerts.Sent.Single();
        Assert.Equal((AlertKinds.MeetingRequest, AlertPriority.High, "calendar"), (alert.Kind, alert.Priority, alert.Tag));
        Assert.Equal("Thu 22 Oct, 15:00 (Europe/London)\nAbout a website", alert.Message);
        Assert.Contains("/decline?token=", alert.Actions![1].Url);
    }

    [Fact]
    public async Task Cal_com_declining_or_a_pending_booking_reads_as_such()
    {
        await Webhook(Booking("BOOKING_REQUESTED"));
        await Webhook(Booking("BOOKING_REJECTED"));
        Assert.Equal(MeetingStatus.Declined, _db.Meetings.Single().Status);
        Assert.Null(_db.Meetings.Single().DecisionTokenHash);
        Assert.Equal("Meeting declined: Ada", _alerts.Sent[^1].Title);

        await Webhook(Booking("BOOKING_CREATED", uid: "b2", extra: ""","status":"PENDING" """));
        Assert.Equal(MeetingStatus.Requested, _db.Meetings.Single(m => m.Uid == "b2").Status);
        Assert.Equal("Meeting request: Ada", _alerts.Sent[^1].Title);
    }

    [Fact]
    public async Task Someone_who_gave_no_name_is_named_by_their_email()
    {
        await Webhook("""{"triggerEvent":"BOOKING_CREATED","payload":{"uid":"b1","startTime":"2026-10-22T14:00:00Z","endTime":"2026-10-22T14:30:00Z","attendees":[{"email":"ada@example.com"}]}}""");

        Assert.Equal("Meeting booked: ada@example.com", _alerts.Sent.Single().Title);
        Assert.Equal("Meeting", _db.Meetings.Single().Title);
        // The admin's own time zone.
        Assert.Equal("Thu 22 Oct, 15:00 (Europe/London)", _alerts.Sent.Single().Message);
    }

    [Fact]
    public async Task Long_fields_are_cut_and_odd_shapes_dont_break_it()
    {
        var name = new string('n', 500);
        var body = "{\"triggerEvent\":\"BOOKING_CREATED\",\"payload\":{\"uid\":\"b1\",\"title\":\"" + new string('t', 400) + "\",\"startTime\":\"2026-10-22T14:00:00Z\",\"endTime\":\"2026-10-22T14:30:00Z\","
            + "\"attendees\":[{\"name\":\"" + name + "\",\"email\":\"ada@example.com\",\"timeZone\":42}],\"responses\":[\"not an object\"],\"additionalNotes\":\"Hi there\"}}";

        Assert.IsType<Ok>((await Webhook(body)).Result);

        var meeting = _db.Meetings.Single();
        Assert.Equal((300, 200), (meeting.Title.Length, meeting.AttendeeName.Length));
        Assert.Null(meeting.AttendeeTimeZone);
        Assert.Equal("Hi there", meeting.Notes);
    }

    [Fact]
    public void Notes_can_come_as_plain_text_too()
    {
        Assert.Equal("Plain notes", MeetingsEndpoints.ParseCal("""{"triggerEvent":"BOOKING_CREATED","payload":{"uid":"b1","responses":{"notes":"Plain notes"}}}""")!.Notes);
        Assert.Equal("old", MeetingsEndpoints.ParseCal("""{"triggerEvent":"BOOKING_RESCHEDULED","payload":{"uid":"b2","fromReschedule":"old"}}""")!.RescheduledFromUid);
        Assert.Null(MeetingsEndpoints.ParseCal("null"));
    }

    [Fact]
    public async Task A_meeting_moved_to_another_time_gets_its_reminders_again()
    {
        await Webhook(Booking("BOOKING_CREATED"));
        var meeting = _db.Meetings.Single();
        meeting.RemindersSent = 1;
        await _db.SaveChangesAsync();

        await Webhook(Booking("BOOKING_CREATED"));
        Assert.Equal(1, _db.Meetings.Single().RemindersSent);

        await Webhook(Booking("BOOKING_CREATED", start: "2026-10-23T09:00:00Z"));
        Assert.Equal(0, _db.Meetings.Single().RemindersSent);
        Assert.Equal(new DateTimeOffset(2026, 10, 23, 9, 0, 0, TimeSpan.Zero), _db.Meetings.Single().StartTime);
    }

    [Fact]
    public async Task Accepting_without_a_note_emails_nobody()
    {
        await Webhook(Booking("BOOKING_REQUESTED"));

        var result = await Decide(_db.Meetings.Single().Id, accept: true, message: "   ");

        Assert.Equal(new MeetingDecisionResult(MeetingStatus.Accepted, false), Assert.IsType<Ok<MeetingDecisionResult>>(result.Result).Value);
        Assert.Empty(_emails.Sent);
        Assert.Null(_db.Meetings.Single().DecisionTokenHash);
    }

    [Fact]
    public async Task Declining_without_a_reason_gives_Cal_com_none()
    {
        await Webhook(Booking("BOOKING_REQUESTED"));

        await Decide(_db.Meetings.Single().Id, accept: false);

        Assert.Equal(["decline b1"], _cal.Calls);
    }

    [Fact]
    public async Task The_declined_note_says_it_wont_go_ahead()
    {
        await Webhook(Booking("BOOKING_REQUESTED"));

        await Decide(_db.Meetings.Single().Id, accept: false, message: "I'm away that week.");

        var email = Assert.Single(_emails.Sent);
        Assert.Equal("About the meeting you asked for on Thu 22 Oct, 15:00 (Europe/London)", email.Subject);
        Assert.Contains("won't go ahead", email.Text);
    }

    [Fact]
    public async Task When_the_note_cant_be_emailed_the_decision_still_stands()
    {
        await Webhook(Booking("BOOKING_REQUESTED"));
        _emails.Fail = true;

        var result = await Decide(_db.Meetings.Single().Id, accept: true, message: "See you!");

        Assert.Equal(new MeetingDecisionResult(MeetingStatus.Accepted, false), Assert.IsType<Ok<MeetingDecisionResult>>(result.Result).Value);
        Assert.Equal(MeetingStatus.Accepted, _db.Meetings.Single().Status);
    }

    [Fact]
    public async Task A_note_too_long_is_refused_before_anything_happens()
    {
        await Webhook(Booking("BOOKING_REQUESTED"));

        var result = await Decide(_db.Meetings.Single().Id, accept: true, message: new string('x', MeetingsEndpoints.MessageMaxLength + 1));

        Assert.IsType<ValidationProblem>(result.Result);
        Assert.Empty(_cal.Calls);
        Assert.Equal(MeetingStatus.Requested, _db.Meetings.Single().Status);
    }

    [Fact]
    public async Task The_phone_cant_attach_a_note_and_its_token_works_once()
    {
        await Webhook(Booking("BOOKING_REQUESTED"));
        var id = _db.Meetings.Single().Id;
        var token = _alerts.Sent.Single().Actions![1].Url.Split("token=")[1];

        await Decide(id, false, message: "From the phone", admin: false, token: token);

        Assert.Equal(["decline b1"], _cal.Calls);
        Assert.Empty(_emails.Sent);
        // Decided: the token is spent.
        Assert.IsType<UnauthorizedHttpResult>((await Decide(id, true, admin: false, token: token)).Result);
    }

    [Fact]
    public async Task Without_sign_in_or_a_token_nothing_is_decided()
    {
        await Webhook(Booking("BOOKING_REQUESTED"));
        var id = _db.Meetings.Single().Id;

        Assert.IsType<UnauthorizedHttpResult>((await Decide(id, true, admin: false)).Result);
        Assert.IsType<UnauthorizedHttpResult>((await Decide(id, true, admin: false, token: "")).Result);
        Assert.IsType<NotFound>((await Decide(id + 1, true)).Result);
        Assert.Empty(_cal.Calls);
    }

    [Fact]
    public async Task The_calendar_lists_a_month_or_the_next_two_months_soonest_first()
    {
        void Add(string uid, DateTimeOffset start, string status = MeetingStatus.Accepted) =>
            _db.Meetings.Add(new Meeting { Uid = uid, Title = uid, AttendeeName = "Ada", AttendeeEmail = "ada@example.com", Status = status, StartTime = start, EndTime = start.AddMinutes(30) });
        Add("later", Now.AddDays(10));
        Add("sooner", Now.AddDays(1), MeetingStatus.Requested);
        Add("long ago", Now.AddDays(-30));
        Add("too far", Now.AddDays(90));
        await _db.SaveChangesAsync();

        var next = (await MeetingsEndpoints.ListMeetings(_db, _time, default)).Value!;
        Assert.Equal(["sooner", "later"], next.Select(m => m.Title));

        var september = (await MeetingsEndpoints.ListMeetings(_db, _time, default, Now.AddDays(-35), Now.AddDays(-5))).Value!;
        Assert.Equal(["long ago"], september.Select(m => m.Title));
    }

    [Theory]
    [InlineData("claomike/30min", "claomike/30min")]
    [InlineData("https://cal.com/claomike/30min", "claomike/30min")]
    [InlineData("https://cal.com/claomike/", "claomike")]
    [InlineData("https://evil.example/claomike/30min", "")]
    [InlineData("javascript:alert(1)", "")]
    [InlineData("  https://app.cal.com/claomike/30min/  ", "claomike/30min")]
    [InlineData("ftp://cal.com/claomike", "")]
    [InlineData("https://notcal.com/claomike", "")]
    [InlineData("claomike/30min/extra", "")]
    [InlineData("clao mike", "")]
    [InlineData(null, "")]
    public void Links_are_normalized(string? input, string expected) => Assert.Equal(expected, CalOptions.NormalizeLink(input));
}

public class MeetingRemindersTests
{
    private static readonly DateTimeOffset Start = new(2026, 10, 22, 14, 0, 0, TimeSpan.Zero);

    private readonly FakeTimeProvider _time = new(Start.AddDays(-2));
    private readonly FakePhoneAlerts _alerts = new();
    private readonly PortfolioDbContext _db = new(new DbContextOptionsBuilder<PortfolioDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    private MeetingReminders Reminders() => new(_db, _alerts, Options.Create(new SiteOptions()), _time);

    private void Meeting(string status = MeetingStatus.Accepted)
    {
        _db.Meetings.Add(new Meeting { Uid = Guid.NewGuid().ToString(), Title = "30 min", AttendeeName = "Ada", AttendeeEmail = "ada@example.com", Status = status, StartTime = Start, EndTime = Start.AddMinutes(30) });
        _db.SaveChanges();
    }

    /// <summary>Runs the reminders at this time before the start.</summary>
    private Task At(TimeSpan beforeStart)
    {
        _time.SetUtcNow(Start - beforeStart);
        return Reminders().SendDueAsync(default);
    }

    [Fact]
    public async Task Goes_off_a_day_two_hours_and_five_minutes_before_and_at_the_start_each_once()
    {
        Meeting();

        await At(TimeSpan.FromDays(2));
        await At(TimeSpan.FromDays(1));
        await At(TimeSpan.FromHours(23));
        await At(TimeSpan.FromHours(2));
        await At(TimeSpan.FromMinutes(5));
        await At(TimeSpan.FromMinutes(4));
        await At(TimeSpan.Zero);
        await At(-TimeSpan.FromMinutes(1));

        Assert.Equal(["Tomorrow: meeting with Ada", "In 2 hours: meeting with Ada", "In 5 minutes: meeting with Ada", "Now: meeting with Ada"], _alerts.Sent.Select(a => a.Title));
    }

    [Fact]
    public async Task Accepted_late_it_only_sends_the_latest_reminder_that_is_due()
    {
        Meeting();

        await At(TimeSpan.FromHours(1));

        Assert.Equal(["In 2 hours: meeting with Ada"], _alerts.Sent.Select(a => a.Title));
    }

    [Theory]
    [InlineData(9, true)]
    [InlineData(11, false)]
    public async Task A_start_missed_by_a_few_minutes_still_alerts_but_not_much_later(int minutesLate, bool alerts)
    {
        Meeting();
        _db.Meetings.Single().RemindersSent = 7;
        await _db.SaveChangesAsync();

        await At(-TimeSpan.FromMinutes(minutesLate));

        Assert.Equal(alerts ? ["Now: meeting with Ada"] : [], _alerts.Sent.Select(a => a.Title));
        if (alerts) Assert.Equal((AlertPriority.High, AlertKinds.MeetingReminder), (_alerts.Sent[0].Priority, _alerts.Sent[0].Kind));
    }

    [Fact]
    public async Task The_day_before_reminder_is_quiet_and_says_when_and_what()
    {
        Meeting();

        await At(TimeSpan.FromHours(20));

        var alert = Assert.Single(_alerts.Sent);
        Assert.Equal(AlertPriority.Default, alert.Priority);
        Assert.Equal("Thu 22 Oct, 15:00 (Europe/London) · 30 min", alert.Message);
        Assert.Equal(1, _db.Meetings.Single().RemindersSent);
    }

    [Fact]
    public async Task Requests_and_cancelled_meetings_get_none()
    {
        Meeting(MeetingStatus.Requested);
        Meeting(MeetingStatus.Cancelled);

        await At(TimeSpan.FromMinutes(5));

        Assert.Empty(_alerts.Sent);
    }
}
