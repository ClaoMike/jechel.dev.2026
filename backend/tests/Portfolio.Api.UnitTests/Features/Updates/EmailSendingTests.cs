using System.Net;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Portfolio.Api.Features.Settings;
using Portfolio.Api.Features.Updates;

namespace Portfolio.Api.UnitTests.Features.Updates;

/// <summary>How emails leave: Resend's API when a key is set, the log otherwise.</summary>
public class EmailSendingTests
{
    private static readonly EmailMessage Update = new("ada@example.com", "A new app is out: Space Game", "<p>Hi</p>", "Hi", UnsubscribeUrl: "https://jechel.dev/updates/unsubscribe?token=t");

    /// <summary>Resend's API, answering <paramref name="status"/> with <paramref name="body"/>; keeps what it was sent.</summary>
    private sealed class FakeResend(HttpStatusCode status = HttpStatusCode.OK, string body = """{"id":"1"}""") : HttpMessageHandler
    {
        public HttpRequestMessage? Request { get; private set; }
        public JsonNode? Body { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Request = request;
            Body = JsonNode.Parse(await request.Content!.ReadAsStringAsync(cancellationToken));
            return new HttpResponseMessage(status) { Content = new StringContent(body) };
        }
    }

    private static ResendEmailSender Resend(FakeResend api, string key = " re_key ", string? from = null) =>
        new(new HttpClient(api) { BaseAddress = ResendEmailSender.BaseAddress },
            TestOptions.Monitor(from is null ? new EmailOptions { ResendApiKey = key } : new EmailOptions { ResendApiKey = key, From = from }));

    [Fact]
    public async Task Sends_through_Resend_with_the_key_the_sender_and_both_versions_of_the_email()
    {
        var api = new FakeResend();

        await Resend(api, from: "jechel.dev <updates@jechel.dev>").SendAsync(Update, default);

        Assert.Equal(HttpMethod.Post, api.Request!.Method);
        Assert.Equal("https://api.resend.com/emails", api.Request.RequestUri!.ToString());
        Assert.Equal(("Bearer", "re_key"), (api.Request.Headers.Authorization!.Scheme, api.Request.Headers.Authorization.Parameter));
        Assert.Equal("jechel.dev <updates@jechel.dev>", (string?)api.Body!["from"]);
        Assert.Equal(["ada@example.com"], api.Body["to"]!.AsArray().Select(t => (string?)t));
        Assert.Equal(("A new app is out: Space Game", "<p>Hi</p>", "Hi"), ((string?)api.Body["subject"], (string?)api.Body["html"], (string?)api.Body["text"]));
    }

    [Fact]
    public async Task Adds_one_click_unsubscribe_headers_to_updates_as_mail_services_require()
    {
        var api = new FakeResend();

        await Resend(api).SendAsync(Update, default);

        var headers = api.Body!["headers"]!;
        Assert.Equal("<https://jechel.dev/updates/unsubscribe?token=t>", (string?)headers["List-Unsubscribe"]);
        Assert.Equal("List-Unsubscribe=One-Click", (string?)headers["List-Unsubscribe-Post"]);
    }

    [Fact]
    public async Task Leaves_out_what_an_email_doesnt_have_and_adds_a_reply_address_when_it_does()
    {
        var plain = new FakeResend();
        var reply = new FakeResend();

        await Resend(plain).SendAsync(new EmailMessage("ada@example.com", "S", "<p>H</p>", "T"), default);
        await Resend(reply).SendAsync(new EmailMessage("ada@example.com", "S", "<p>H</p>", "T", ReplyTo: "admin@example.com"), default);

        Assert.Null(plain.Body!["headers"]);
        Assert.Null(plain.Body["reply_to"]);
        Assert.Equal("admin@example.com", (string?)reply.Body!["reply_to"]);
    }

    [Fact]
    public async Task Says_why_Resend_refused_it()
    {
        var api = new FakeResend(HttpStatusCode.Forbidden, """{"statusCode":403,"message":"The jechel.dev domain is not verified."}""");

        var error = await Assert.ThrowsAsync<ServiceException>(() => Resend(api).SendAsync(Update, default));

        Assert.Equal("Resend refused it: The jechel.dev domain is not verified.", error.Message);
    }

    [Theory]
    [InlineData("<html>Bad gateway</html>")]
    [InlineData("""{"error":"no message here"}""")]
    [InlineData("")]
    public async Task Says_the_status_when_Resend_gives_no_reason(string body)
    {
        var error = await Assert.ThrowsAsync<ServiceException>(() => Resend(new FakeResend(HttpStatusCode.BadGateway, body)).SendAsync(Update, default));

        Assert.Equal("Resend refused it: 502 BadGateway", error.Message);
    }

    [Fact]
    public void Defaults_to_Resends_own_sender_until_a_domain_is_verified() =>
        Assert.Equal("jechel.dev <onboarding@resend.dev>", new EmailOptions().From);

    [Theory]
    [InlineData("re_key", true)]
    [InlineData("  ", false)]
    [InlineData("", false)]
    public void Uses_Resend_only_with_a_key(string key, bool configured) =>
        Assert.Equal(configured, new EmailOptions { ResendApiKey = key }.IsConfigured);

    [Fact]
    public async Task Writes_emails_to_the_log_until_Resend_has_a_key_and_sends_them_once_it_has()
    {
        var options = new EmailOptions();
        var api = new FakeResend();
        var log = new ListLogger();
        var sender = new SwitchingEmailSender(Resend(api), new LogEmailSender(log), TestOptions.Monitor(options));

        await sender.SendAsync(Update, default);
        Assert.False(sender.IsConfigured);
        Assert.Null(api.Request);
        Assert.Contains("ada@example.com", Assert.Single(log.Lines));

        options.ResendApiKey = "re_key";
        await sender.SendAsync(Update, default);
        Assert.True(sender.IsConfigured);
        Assert.NotNull(api.Request);
    }

    private sealed class ListLogger : ILogger<LogEmailSender>
    {
        public List<string> Lines { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) => Lines.Add(formatter(state, exception));
    }
}
