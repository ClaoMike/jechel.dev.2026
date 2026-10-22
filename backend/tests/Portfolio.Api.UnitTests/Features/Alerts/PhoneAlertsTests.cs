using System.Net;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Features.Alerts;

namespace Portfolio.Api.UnitTests.Features.Alerts;

public class PhoneAlertsTests
{
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 18, 12, 0, 0, TimeSpan.Zero));

    private static int Queued(PhoneAlerts alerts)
    {
        var count = 0;
        while (alerts.Reader.TryRead(out _)) count++;
        return count;
    }

    [Fact]
    public void Send_queues_every_alert()
    {
        var alerts = new PhoneAlerts(_time);

        alerts.Send(new PhoneAlert(AlertKinds.SiteError, "One", "1"));
        alerts.Send(new PhoneAlert(AlertKinds.SiteError, "Two", "2"));

        Assert.Equal(2, Queued(alerts));
    }

    [Fact]
    public void SendThrottled_sends_the_same_key_once_an_hour()
    {
        var alerts = new PhoneAlerts(_time);
        var alert = new PhoneAlert(AlertKinds.SiteError, "Site error", "TypeError");

        alerts.SendThrottled("web:TypeError", alert);
        alerts.SendThrottled("web:TypeError", alert);
        alerts.SendThrottled("web:Other", alert);
        Assert.Equal(2, Queued(alerts));

        _time.Advance(PhoneAlerts.ThrottleWindow);
        alerts.SendThrottled("web:TypeError", alert);
        Assert.Equal(1, Queued(alerts));
    }

    [Fact]
    public void SendThrottled_caps_how_many_go_out_an_hour_whatever_the_keys()
    {
        var alerts = new PhoneAlerts(_time);

        for (var i = 0; i < PhoneAlerts.MaxThrottledPerWindow + 5; i++) alerts.SendThrottled($"key {i}", new PhoneAlert(AlertKinds.SiteError, "Error", $"{i}"));

        Assert.Equal(PhoneAlerts.MaxThrottledPerWindow, Queued(alerts));
    }

    [Fact]
    public void NtfyMessage_links_to_the_site_and_cuts_long_text()
    {
        var body = NtfySender.NtfyMessage(
            new PhoneAlert(AlertKinds.SiteError, "New message", new string('m', 5000), "/contact", AlertPriority.High, "envelope"),
            "my-topic",
            new SiteOptions { PublicUrl = "https://jechel.dev/" });

        Assert.Equal("my-topic", body["topic"]);
        Assert.Equal(4, body["priority"]);
        Assert.Equal("https://jechel.dev/contact", body["click"]);
        Assert.Equal(new[] { "envelope" }, body["tags"]);
        Assert.Equal(1000, ((string)body["message"]).Length);
    }

    [Fact]
    public void NtfyMessage_turns_actions_into_buttons_that_post()
    {
        var body = NtfySender.NtfyMessage(
            new PhoneAlert(AlertKinds.SiteError, "New app", "Send it?", Actions: [new AlertAction("Send email", "https://jechel.dev/send?token=t")]),
            "my-topic",
            new SiteOptions());

        var action = Assert.Single((Dictionary<string, object>[])body["actions"]);
        Assert.Equal("http", action["action"]);
        Assert.Equal("Send email", action["label"]);
        Assert.Equal("https://jechel.dev/send?token=t", action["url"]);
        Assert.Equal("POST", action["method"]);
        Assert.Equal(true, action["clear"]);
    }

    // ---------- Throttling, and the queue ----------

    [Fact]
    public void SendThrottled_lets_more_through_as_the_hour_slides_on()
    {
        var alerts = new PhoneAlerts(_time);
        for (var i = 0; i < PhoneAlerts.MaxThrottledPerWindow; i++)
        {
            alerts.SendThrottled($"key {i}", new PhoneAlert(AlertKinds.SiteError, "Error", $"{i}"));
            _time.Advance(TimeSpan.FromMinutes(5));
        }
        Assert.Equal(PhoneAlerts.MaxThrottledPerWindow, Queued(alerts));
        alerts.SendThrottled("one more", new PhoneAlert(AlertKinds.SiteError, "Error", "x"));
        Assert.Equal(0, Queued(alerts));

        // The first went out an hour ago: room for one, not two.
        _time.Advance(TimeSpan.FromMinutes(10));
        alerts.SendThrottled("later", new PhoneAlert(AlertKinds.SiteError, "Error", "y"));
        alerts.SendThrottled("later still", new PhoneAlert(AlertKinds.SiteError, "Error", "z"));
        Assert.Equal(1, Queued(alerts));
    }

    [Fact]
    public void A_key_turned_away_by_the_cap_isnt_remembered_and_goes_out_once_there_is_room()
    {
        var alerts = new PhoneAlerts(_time);
        for (var i = 0; i < PhoneAlerts.MaxThrottledPerWindow; i++) alerts.SendThrottled($"key {i}", new PhoneAlert(AlertKinds.SiteError, "Error", $"{i}"));
        alerts.SendThrottled("capped", new PhoneAlert(AlertKinds.SiteError, "Error", "capped"));
        Queued(alerts);

        _time.Advance(PhoneAlerts.ThrottleWindow);
        alerts.SendThrottled("capped", new PhoneAlert(AlertKinds.SiteError, "Error", "capped"));

        Assert.True(alerts.Reader.TryRead(out var sent));
        Assert.Equal("capped", sent.Message);
    }

    [Fact]
    public void Send_isnt_throttled_however_many()
    {
        var alerts = new PhoneAlerts(_time);

        for (var i = 0; i < 50; i++) alerts.Send(new PhoneAlert(AlertKinds.SiteError, "Message", $"{i}"));

        Assert.Equal(50, Queued(alerts));
    }

    [Fact]
    public void With_the_phone_unreachable_for_long_the_queue_keeps_the_newest_100()
    {
        var alerts = new PhoneAlerts(_time);

        for (var i = 0; i < 130; i++) alerts.Send(new PhoneAlert(AlertKinds.SiteError, "Message", $"{i}"));

        var kept = new List<string>();
        while (alerts.Reader.TryRead(out var alert)) kept.Add(alert.Message);
        Assert.Equal(100, kept.Count);
        Assert.Equal(("30", "129"), (kept[0], kept[^1]));
    }

    [Fact]
    public async Task Throttling_holds_when_many_requests_alert_at_once()
    {
        var alerts = new PhoneAlerts(_time);

        await Task.WhenAll(Enumerable.Range(0, 200).Select(i => Task.Run(() => alerts.SendThrottled(i % 2 == 0 ? "same" : $"key {i}", new PhoneAlert(AlertKinds.SiteError, "Error", $"{i}")))));

        Assert.Equal(PhoneAlerts.MaxThrottledPerWindow, Queued(alerts));
    }

    // ---------- What ntfy is sent ----------

    [Fact]
    public void NtfyMessage_leaves_out_what_an_alert_doesnt_have()
    {
        var body = NtfySender.NtfyMessage(new PhoneAlert(AlertKinds.SiteError, "Hi", "There"), "t", new SiteOptions());

        Assert.Equal(["topic", "title", "message", "priority"], body.Keys);
        Assert.Equal(3, body["priority"]);
    }

    [Theory]
    [InlineData(AlertPriority.Low, 2)]
    [InlineData(AlertPriority.Default, 3)]
    [InlineData(AlertPriority.High, 4)]
    public void NtfyMessage_sends_ntfys_own_priority_numbers(AlertPriority priority, int expected) =>
        Assert.Equal(expected, NtfySender.NtfyMessage(new PhoneAlert(AlertKinds.SiteError, "T", "M", Priority: priority), "t", new SiteOptions())["priority"]);

    [Fact]
    public void A_long_title_is_cut_to_200_and_ends_in_an_ellipsis()
    {
        var title = (string)NtfySender.NtfyMessage(new PhoneAlert(AlertKinds.SiteError, new string('t', 300), "M"), "t", new SiteOptions())["title"];

        Assert.Equal(200, title.Length);
        Assert.EndsWith("…", title);
    }

    [Fact]
    public void Cutting_never_splits_an_emoji_in_two()
    {
        // "☕" is one UTF-16 unit, "⭐" too; "🛍" (and most) are two: cutting between them leaves half a character.
        var text = new string('a', 8) + "🛍️🛍️🛍️";

        for (var max = 5; max <= 14; max++)
        {
            var cut = NtfySender.Cut(text, max);
            Assert.True(cut.Length <= max);
            Assert.True(WholeCharacters(cut), $"max {max}: half a character in \"{cut}\"");
        }
        Assert.Equal("short", NtfySender.Cut("short", 10));
    }

    /// <summary>No lone half of a surrogate pair: every character is whole.</summary>
    private static bool WholeCharacters(string text)
    {
        for (var i = 0; i < text.Length; i++)
        {
            if (char.IsHighSurrogate(text[i]) && !(i + 1 < text.Length && char.IsLowSurrogate(text[++i]))) return false;
            if (char.IsLowSurrogate(text[i]) && !(i > 0 && char.IsHighSurrogate(text[i - 1]))) return false;
        }
        return true;
    }

    // ---------- Sending to ntfy ----------

    private sealed class FakeNtfy(HttpStatusCode status = HttpStatusCode.OK) : HttpMessageHandler
    {
        public List<(HttpRequestMessage Request, JsonNode Body)> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add((request, JsonNode.Parse(await request.Content!.ReadAsStringAsync(cancellationToken))!));
            return new HttpResponseMessage(status);
        }
    }

    private sealed class Clients(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private static NtfySender Sender(FakeNtfy ntfy, AlertOptions options) =>
        new(new Clients(ntfy), TestOptions.Monitor(options), Options.Create(new SiteOptions { PublicUrl = "https://jechel.dev" }), NullLogger<NtfySender>.Instance);

    [Fact]
    public async Task Without_a_topic_nothing_is_sent_only_logged()
    {
        var ntfy = new FakeNtfy();

        Assert.False(await Sender(ntfy, new AlertOptions { NtfyTopic = "  " }).SendAsync(new PhoneAlert(AlertKinds.SiteError, "T", "M"), default));
        Assert.Empty(ntfy.Requests);
    }

    [Fact]
    public async Task Posts_json_to_the_server_with_the_topic_trimmed_and_no_token_unless_set()
    {
        var ntfy = new FakeNtfy();

        Assert.True(await Sender(ntfy, new AlertOptions { NtfyTopic = " jechel-abc " }).SendAsync(new PhoneAlert(AlertKinds.SiteError, "☕ 5 GBP from Jo", "Thanks!", "/community"), default));

        var (request, body) = Assert.Single(ntfy.Requests);
        Assert.Equal((HttpMethod.Post, "https://ntfy.sh/"), (request.Method, request.RequestUri!.ToString()));
        Assert.Null(request.Headers.Authorization);
        Assert.Equal(("jechel-abc", "☕ 5 GBP from Jo", "https://jechel.dev/community"), ((string?)body["topic"], (string?)body["title"], (string?)body["click"]));
    }

    [Theory]
    [InlineData("https://ntfy.example.com/", "https://ntfy.example.com/")]
    [InlineData(" https://ntfy.example.com ", "https://ntfy.example.com/")]
    [InlineData("", "https://ntfy.sh/")]
    public async Task Uses_the_servers_address_as_set_or_the_public_one(string server, string expected)
    {
        var ntfy = new FakeNtfy();

        await Sender(ntfy, new AlertOptions { NtfyTopic = "t", NtfyServer = server, NtfyToken = " tk_123 " }).SendAsync(new PhoneAlert(AlertKinds.SiteError, "T", "M"), default);

        var request = Assert.Single(ntfy.Requests).Request;
        Assert.Equal(expected, request.RequestUri!.ToString());
        Assert.Equal(("Bearer", "tk_123"), (request.Headers.Authorization!.Scheme, request.Headers.Authorization.Parameter));
    }

    [Fact]
    public async Task Throws_when_ntfy_refuses_it()
    {
        await Assert.ThrowsAsync<HttpRequestException>(() => Sender(new FakeNtfy(HttpStatusCode.Forbidden), new AlertOptions { NtfyTopic = "t" }).SendAsync(new PhoneAlert(AlertKinds.SiteError, "T", "M"), default));
    }

    [Fact]
    public async Task The_worker_sends_the_queue_in_order_and_carries_on_after_one_fails()
    {
        var ntfy = new FlakyNtfy(failOn: "Two");
        var alerts = new PhoneAlerts(_time);
        var worker = new AlertWorker(alerts, Sender(ntfy, new AlertOptions { NtfyTopic = "t" }), new AlertPreferences(), new YouTube.TestDatabase().Scopes, _time, NullLogger<AlertWorker>.Instance);

        await worker.StartAsync(default);
        foreach (var title in new[] { "One", "Two", "Three" }) alerts.Send(new PhoneAlert(AlertKinds.SiteError, title, "m"));
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (ntfy.Titles.Count < 3 && DateTime.UtcNow < deadline) await Task.Delay(10);
        await worker.StopAsync(default);

        Assert.Equal(["One", "Two", "Three"], ntfy.Titles);
    }

    private sealed class FlakyNtfy(string failOn) : FakeNtfyBase
    {
        protected override HttpStatusCode Answer(string title) => title == failOn ? HttpStatusCode.InternalServerError : HttpStatusCode.OK;
    }

    private abstract class FakeNtfyBase : HttpMessageHandler
    {
        public List<string> Titles { get; } = [];
        protected abstract HttpStatusCode Answer(string title);

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var title = (string)JsonNode.Parse(await request.Content!.ReadAsStringAsync(cancellationToken))!["title"]!;
            lock (Titles) Titles.Add(title);
            return new HttpResponseMessage(Answer(title));
        }
    }

    private static NtfySender Sender(FakeNtfyBase ntfy, AlertOptions options) =>
        new(new Clients(ntfy), TestOptions.Monitor(options), Options.Create(new SiteOptions()), NullLogger<NtfySender>.Instance);

    // ---------- API crashes ----------

    private static DefaultHttpContext Request(string method, string path)
    {
        var http = new DefaultHttpContext();
        http.Request.Method = method;
        http.Request.Path = path;
        return http;
    }

    [Fact]
    public async Task An_API_crash_rings_the_phone_once_an_hour_per_kind_and_endpoint_then_lets_the_default_answer()
    {
        var alerts = new FakePhoneAlerts();
        var handler = new CrashAlertHandler(alerts, NullLogger<CrashAlertHandler>.Instance);

        var handled = await handler.TryHandleAsync(Request("GET", "/api/apps"), new InvalidOperationException("Sequence contains no elements"), default);

        Assert.False(handled);
        var (key, alert) = Assert.Single(alerts.Throttled);
        Assert.Equal("api:System.InvalidOperationException:GET /api/apps", key);
        Assert.Equal(("API crash: InvalidOperationException", "GET /api/apps\nSequence contains no elements", "/engagement", AlertPriority.High), (alert.Title, alert.Message, alert.Path, alert.Priority));
    }

    [Fact]
    public async Task A_cancelled_request_or_a_malformed_one_isnt_a_crash()
    {
        var alerts = new FakePhoneAlerts();
        var handler = new CrashAlertHandler(alerts, NullLogger<CrashAlertHandler>.Instance);
        var left = Request("GET", "/api/apps");
        using var gone = new CancellationTokenSource();
        gone.Cancel();
        left.RequestAborted = gone.Token;

        await handler.TryHandleAsync(left, new OperationCanceledException(), default);
        await handler.TryHandleAsync(Request("GET", "/api/apps"), new BadHttpRequestException("page=two"), default);

        Assert.Empty(alerts.Throttled);
        // Cancelled while the visitor was still there: that is a crash (a timeout inside the API, say).
        await handler.TryHandleAsync(Request("GET", "/api/apps"), new OperationCanceledException(), default);
        Assert.Single(alerts.Throttled);
    }

    [Fact]
    public void A_long_running_server_forgets_old_throttle_keys()
    {
        var alerts = new PhoneAlerts(_time);
        // Ten new errors an hour (the most that ring) for over 100 hours: past 1,000 keys, the old ones go.
        for (var hour = 0; hour < 101; hour++)
        {
            for (var i = 0; i < PhoneAlerts.MaxThrottledPerWindow; i++) alerts.SendThrottled($"web:{hour}:{i}", new PhoneAlert(AlertKinds.SiteError, "Site error", $"{hour}"));
            _time.Advance(PhoneAlerts.ThrottleWindow);
        }
        alerts.SendThrottled("web:last", new PhoneAlert(AlertKinds.SiteError, "Site error", "last"));

        var remembered = (System.Collections.IDictionary)typeof(PhoneAlerts).GetField("_lastSent", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!.GetValue(alerts)!;
        Assert.True(remembered.Count <= PhoneAlerts.MaxThrottledPerWindow + 1, $"{remembered.Count} keys");
    }
}
