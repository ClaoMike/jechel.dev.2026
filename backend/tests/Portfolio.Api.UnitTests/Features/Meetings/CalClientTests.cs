using System.Net;
using System.Text;
using Portfolio.Api.Features.Meetings;
using Portfolio.Api.Features.Settings;

namespace Portfolio.Api.UnitTests.Features.Meetings;

public class CalClientTests
{
    /// <summary>Cal.com's API: answers with <see cref="Status"/> and <see cref="Body"/>, and records each request.</summary>
    private sealed class FakeCal : HttpMessageHandler
    {
        public HttpStatusCode Status { get; set; } = HttpStatusCode.OK;
        public string Body { get; set; } = """{"status":"success"}""";
        public List<(HttpMethod Method, string Url, string? Authorization, string? Version, string? Content)> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var content = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            Requests.Add((request.Method, request.RequestUri!.ToString(), request.Headers.Authorization?.ToString(), request.Headers.GetValues("cal-api-version").Single(), content));
            return new HttpResponseMessage(Status) { Content = new StringContent(Body, Encoding.UTF8, "application/json") };
        }
    }

    private readonly FakeCal _cal = new();

    private CalClient Client(string apiKey = " cal_live_abc ") =>
        new(new HttpClient(_cal) { BaseAddress = CalClient.BaseAddress }, TestOptions.Monitor(new CalOptions { ApiKey = apiKey }));

    [Fact]
    public async Task Confirming_posts_to_the_booking_with_the_key_and_the_documented_version()
    {
        await Client().ConfirmAsync("uid/1", default);

        var request = Assert.Single(_cal.Requests);
        Assert.Equal((HttpMethod.Post, "https://api.cal.com/v2/bookings/uid%2F1/confirm", "Bearer cal_live_abc", CalClient.BookingsApiVersion, (string?)null), request);
    }

    [Fact]
    public async Task Declining_sends_the_reason_only_when_there_is_one()
    {
        await Client().DeclineAsync("b1", "Away that week", default);
        await Client().DeclineAsync("b1", "  ", default);

        Assert.Equal(["""{"reason":"Away that week"}""", "{}"], _cal.Requests.Select(r => r.Content));
        Assert.All(_cal.Requests, r => Assert.EndsWith("/bookings/b1/decline", r.Url));
    }

    [Fact]
    public async Task Without_an_API_key_it_says_so_and_asks_nothing()
    {
        var error = await Assert.ThrowsAsync<ServiceException>(() => Client("").ConfirmAsync("b1", default));

        Assert.Equal("Set the Cal.com API key in Settings first.", error.Message);
        Assert.Empty(_cal.Requests);
    }

    [Theory]
    [InlineData("""{"status":"error","error":{"message":"Booking already confirmed"}}""", "Cal.com refused it: Booking already confirmed")]
    [InlineData("""{"message":"Invalid API key"}""", "Cal.com refused it: Invalid API key")]
    [InlineData("<html>Bad gateway</html>", "Cal.com refused it: 400 BadRequest")]
    [InlineData("", "Cal.com refused it: 400 BadRequest")]
    public async Task A_refusal_gives_Cal_com_s_reason(string body, string expected)
    {
        _cal.Status = HttpStatusCode.BadRequest;
        _cal.Body = body;

        var error = await Assert.ThrowsAsync<ServiceException>(() => Client().ConfirmAsync("b1", default));

        Assert.Equal(expected, error.Message);
    }

    [Theory]
    [InlineData("""{"data":{"username":"claomike","email":"me@example.com"}}""", "claomike")]
    [InlineData("""{"data":{"email":"me@example.com"}}""", "me@example.com")]
    [InlineData("""{"data":{}}""", "your account")]
    public async Task Who_am_I_names_the_account(string body, string expected)
    {
        _cal.Body = body;

        Assert.Equal(expected, await Client().WhoAmIAsync(default));
        Assert.Equal(HttpMethod.Get, _cal.Requests.Single().Method);
        Assert.Equal("https://api.cal.com/v2/me", _cal.Requests.Single().Url);
    }
}

public class MeetingEmailsTests
{
    private static readonly DateTimeOffset Start = new(2026, 10, 22, 14, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData("Europe/London", "Thu 22 Oct, 15:00 (Europe/London)")]
    [InlineData("America/New_York", "Thu 22 Oct, 10:00 (America/New_York)")]
    [InlineData(null, "Thu 22 Oct, 14:00 (UTC)")]
    [InlineData("", "Thu 22 Oct, 14:00 (UTC)")]
    [InlineData("Mars/Olympus", "Thu 22 Oct, 14:00 (UTC)")]
    public void When_is_in_their_time_zone_when_it_is_known(string? zone, string expected) =>
        Assert.Equal(expected, PersonalEmails.FormatWhen(Start, zone));

    [Fact]
    public void An_accepted_note_confirms_the_time_and_replies_reach_the_admin()
    {
        var email = PersonalEmails.MeetingNote("ada@example.com", "Ada", true, Start, "Europe/London", "See you then!", "me@example.com");

        Assert.Equal(("ada@example.com", "Our meeting on Thu 22 Oct, 15:00 (Europe/London)", "me@example.com"), (email.To, email.Subject, email.ReplyTo));
        Assert.Contains("The meeting is confirmed for Thu 22 Oct, 15:00 (Europe/London); Cal.com has sent the invitation.", email.Text);
        Assert.StartsWith("Hi Ada,\n\nSee you then!", email.Text);
        Assert.False(email.FromUpdates);
    }

    [Fact]
    public void Their_name_and_the_note_are_escaped_and_paragraphs_kept()
    {
        var email = PersonalEmails.MeetingNote("ada@example.com", "<Ada>", false, Start, null, "First & foremost\n\nSecond <b>line</b>\nthird", "me@example.com");

        Assert.Contains("Hi &lt;Ada&gt;,", email.Html);
        Assert.Contains("<p>First &amp; foremost</p><p>Second &lt;b&gt;line&lt;/b&gt;<br>third</p>", email.Html);
        Assert.DoesNotContain("<b>line</b>", email.Html);
        Assert.Contains("The meeting on Thu 22 Oct, 14:00 (UTC) won&#39;t go ahead.", email.Html);
    }
}
