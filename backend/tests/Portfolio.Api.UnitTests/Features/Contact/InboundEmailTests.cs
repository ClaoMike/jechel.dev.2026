using System.Net;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Contact;
using Portfolio.Api.Features.Meetings;
using Portfolio.Api.Features.Settings;
using Portfolio.Api.Features.Updates;
using Portfolio.Api.UnitTests.Features.Alerts;

namespace Portfolio.Api.UnitTests.Features.Contact;

public class InboundEmailTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 22, 10, 0, 0, TimeSpan.Zero);
    private static readonly string Secret = "whsec_" + Convert.ToBase64String("inbound-secret"u8.ToArray());

    private sealed class FakeInbox : IResendInbox
    {
        public Dictionary<string, ReceivedEmail> Emails { get; } = [];
        public Exception? Fail { get; set; }
        public int Reads { get; private set; }

        public Task<ReceivedEmail> GetAsync(string emailId, CancellationToken cancellationToken)
        {
            Reads++;
            if (Fail is not null) throw Fail;
            return Task.FromResult(Emails[emailId]);
        }
    }

    private readonly FakeTimeProvider _time = new(Now);
    private readonly FakePhoneAlerts _alerts = new();
    private readonly FakeInbox _inbox = new();
    private readonly EmailOptions _options = new() { From = "Claudiu <hello@jechel.dev>", InboundWebhookSecret = Secret };
    private readonly PortfolioDbContext _db = new(new DbContextOptionsBuilder<PortfolioDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    private static string Event(string emailId, string to = "hello@jechel.dev", string type = "email.received") =>
        $$$"""{"type":"{{{type}}}","created_at":"2026-10-22T10:00:00Z","data":{"email_id":"{{{emailId}}}","to":["{{{to}}}"],"cc":[]}}""";

    private static string Sign(string id, long timestamp, string body, string secret) =>
        Convert.ToBase64String(HMACSHA256.HashData(Convert.FromBase64String(secret["whsec_".Length..]), Encoding.UTF8.GetBytes($"{id}.{timestamp}.{body}")));

    private HttpRequest Request(string body, string? secret = null, DateTimeOffset? at = null)
    {
        var context = new DefaultHttpContext();
        context.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes(body));
        var timestamp = (at ?? Now).ToUnixTimeSeconds();
        context.Request.Headers["svix-id"] = "msg_1";
        context.Request.Headers["svix-timestamp"] = timestamp.ToString();
        context.Request.Headers["svix-signature"] = $"v1,{Sign("msg_1", timestamp, body, secret ?? Secret)}";
        return context.Request;
    }

    private Task<Results<Ok, BadRequest, UnauthorizedHttpResult, ProblemHttpResult>> Receive(HttpRequest request) =>
        InboundEmail.Receive(request, _db, TestOptions.Monitor(_options), _inbox, _alerts, _time, NullLoggerFactory.Instance, default);

    /// <summary>Someone emails the site: Resend keeps it, then calls the webhook.</summary>
    private async Task<Results<Ok, BadRequest, UnauthorizedHttpResult, ProblemHttpResult>> Email(
        string from, string? text, string? subject = null, string? html = null, string? dmarc = "pass", bool automatic = false, int attachments = 0, string to = "hello@jechel.dev")
    {
        var id = Guid.NewGuid().ToString();
        _inbox.Emails[id] = new ReceivedEmail(from, subject, text, html, $"<{id}@mail.example.com>", dmarc, automatic, attachments);
        return await Receive(Request(Event(id, to)));
    }

    private ContactMessage Conversation(string name, string email, DateTimeOffset lastActivity)
    {
        var message = new ContactMessage { Name = name, Email = email, Message = new string('m', 100), ReceivedAt = lastActivity, LastActivityAt = lastActivity, ReadAt = lastActivity };
        _db.ContactMessages.Add(message);
        _db.SaveChanges();
        return message;
    }

    // ---------- Filing it ----------

    [Fact]
    public async Task An_answer_joins_their_latest_conversation_unread_on_top_and_rings_the_phone()
    {
        var older = Conversation("Ada", "ada@example.com", Now.AddDays(-9));
        var latest = Conversation("Ada", "Ada@Example.com", Now.AddDays(-2));
        Conversation("Bob", "bob@example.com", Now.AddDays(-1));

        Assert.IsType<Ok>((await Email("Ada Lovelace <ada@EXAMPLE.com>", "Tuesday works.")).Result);

        var reply = Assert.Single(_db.ContactReplies);
        Assert.Equal((latest.Id, "Tuesday works.", true, Now), (reply.MessageId, reply.Text, reply.FromVisitor, reply.SentAt));
        Assert.EndsWith("@mail.example.com>", reply.EmailMessageId);
        var stored = _db.ContactMessages.Single(m => m.Id == latest.Id);
        Assert.Equal(((DateTimeOffset?)null, Now), (stored.ReadAt, stored.LastActivityAt));
        Assert.NotNull(_db.ContactMessages.Single(m => m.Id == older.Id).ReadAt);
        var alert = Assert.Single(_alerts.Sent);
        Assert.Equal(("New reply from Ada", "Tuesday works.", AlertKinds.Message, "/contact"), (alert.Title, alert.Message, alert.Kind, alert.Path));
    }

    [Fact]
    public async Task An_email_from_someone_new_starts_a_conversation_named_after_them()
    {
        await Email("Grace Hopper <grace@example.com>", "Hello!", subject: "A question");
        await Email("linus@example.com", "No name given");

        var grace = _db.ContactMessages.Single(m => m.Email == "grace@example.com");
        Assert.Equal(("Grace Hopper", "Hello!", "A question", (DateTimeOffset?)null), (grace.Name, grace.Message, grace.Subject, grace.ReadAt));
        Assert.NotNull(grace.EmailId);
        Assert.Equal("linus@example.com", _db.ContactMessages.Single(m => m.Email == "linus@example.com").Name);
        Assert.Equal(["New email from Grace Hopper", "New email from linus@example.com"], _alerts.Sent.Select(a => a.Title));
    }

    [Fact]
    public async Task A_long_email_is_kept_to_the_longest_message_and_a_long_subject_cut()
    {
        await Email("grace@example.com", new string('x', ContactEndpoints.ReplyMaxLength + 50), subject: new string('s', 400));

        var stored = _db.ContactMessages.Single();
        Assert.Equal((ContactEndpoints.ReplyMaxLength, 300), (stored.Message.Length, stored.Subject!.Length));
    }

    [Fact]
    public async Task The_same_email_is_taken_once_and_not_read_again()
    {
        var id = Guid.NewGuid().ToString();
        _inbox.Emails[id] = new ReceivedEmail("grace@example.com", null, "Once", null, null, "pass", false, 0);

        await Receive(Request(Event(id)));
        await Receive(Request(Event(id)));

        Assert.Single(_db.ContactMessages);
        Assert.Equal(1, _inbox.Reads);
        Conversation("Ada", "ada@example.com", Now);
        var replyId = Guid.NewGuid().ToString();
        _inbox.Emails[replyId] = new ReceivedEmail("ada@example.com", null, "Reply once", null, null, "pass", false, 0);
        await Receive(Request(Event(replyId)));
        await Receive(Request(Event(replyId)));
        Assert.Single(_db.ContactReplies);
    }

    // ---------- What's dropped ----------

    [Fact]
    public async Task Emails_to_other_addresses_are_dropped_without_reading_them()
    {
        Assert.IsType<Ok>((await Email("ada@example.com", "Re: your update", to: "updates@jechel.dev")).Result);

        Assert.Empty(_db.ContactMessages);
        Assert.Equal(0, _inbox.Reads);
    }

    [Theory]
    [InlineData("bcc")]
    [InlineData("received_for")]
    public async Task An_email_with_the_site_in_Bcc_or_forwarded_to_it_is_received(string field)
    {
        var id = Guid.NewGuid().ToString();
        _inbox.Emails[id] = new ReceivedEmail("ada@example.com", null, "Hi", null, null, "pass", false, 0);
        var body = $$$"""{"type":"email.received","data":{"email_id":"{{{id}}}","to":["someone@example.com"],"cc":[],"{{{field}}}":["hello@jechel.dev"]}}""";

        Assert.IsType<Ok>((await Receive(Request(body))).Result);

        Assert.Single(_db.ContactMessages);
    }

    [Fact]
    public async Task A_body_announced_as_too_big_isn_t_read()
    {
        var request = Request(Event("e1"));
        request.ContentLength = InboundEmail.MaxBodyBytes + 1;

        Assert.IsType<BadRequest>((await Receive(request)).Result);
    }

    [Fact]
    public async Task The_site_s_address_matches_in_any_case_and_with_a_name()
    {
        await Email("ada@example.com", "Hi", to: "Claudiu <HELLO@jechel.dev>");

        Assert.Single(_db.ContactMessages);
    }

    [Fact]
    public async Task Without_a_sender_address_nothing_is_received()
    {
        _options.From = "";

        await Email("ada@example.com", "Hi", to: "");

        Assert.Empty(_db.ContactMessages);
    }

    [Theory]
    [InlineData("fail", false)]
    [InlineData("pass", true)]
    public async Task Forged_and_automatic_emails_are_dropped(string dmarc, bool automatic)
    {
        Assert.IsType<Ok>((await Email("ada@example.com", "I'm away until Monday.", dmarc: dmarc, automatic: automatic)).Result);

        Assert.Empty(_db.ContactMessages);
        Assert.Empty(_alerts.Sent);
    }

    [Theory]
    [InlineData("hello@jechel.dev")]
    [InlineData("Claudiu <Hello@Jechel.dev>")]
    [InlineData("not an address")]
    [InlineData("")]
    public async Task Emails_from_the_site_itself_or_from_no_one_are_dropped(string from)
    {
        await Email(from, "Loop?");

        Assert.Empty(_db.ContactMessages);
    }

    [Fact]
    public async Task An_unknown_DMARC_verdict_is_still_received()
    {
        await Email("ada@example.com", "Hi", dmarc: null);

        Assert.Single(_db.ContactMessages);
    }

    // ---------- The webhook ----------

    [Fact]
    public async Task Without_the_secret_Resend_is_told_receiving_isn_t_set_up()
    {
        _options.InboundWebhookSecret = " ";

        var result = await Receive(Request(Event("e1")));

        Assert.Equal(503, Assert.IsType<ProblemHttpResult>(result.Result).StatusCode);
    }

    [Fact]
    public async Task A_wrong_signature_or_an_old_one_is_refused()
    {
        Assert.IsType<UnauthorizedHttpResult>((await Receive(Request(Event("e1"), secret: "whsec_" + Convert.ToBase64String("guess"u8.ToArray())))).Result);
        Assert.IsType<UnauthorizedHttpResult>((await Receive(Request(Event("e1"), at: Now.AddMinutes(-6)))).Result);
        Assert.IsType<UnauthorizedHttpResult>((await Receive(Request(Event("e1"), at: Now.AddMinutes(6)))).Result);
        Assert.Equal(0, _inbox.Reads);
    }

    [Fact]
    public async Task Other_events_are_fine_and_a_body_that_isn_t_an_event_is_refused()
    {
        Assert.IsType<Ok>((await Receive(Request(Event("e1", type: "email.sent")))).Result);
        Assert.IsType<BadRequest>((await Receive(Request("not json"))).Result);
        Assert.IsType<BadRequest>((await Receive(Request("[]"))).Result);
        Assert.IsType<BadRequest>((await Receive(Request("""{"type":"email.received","data":{}}"""))).Result);
        Assert.IsType<BadRequest>((await Receive(Request("""{"type":"email.received","data":{"email_id":"__"}}""".Replace("__", new string('x', 101))))).Result);
        Assert.IsType<BadRequest>((await Receive(Request(Event("e1") + new string(' ', 256 * 1024)))).Result);
        Assert.Equal(0, _inbox.Reads);
    }

    [Fact]
    public async Task When_Resend_can_t_give_the_email_it_s_asked_to_try_again()
    {
        _inbox.Fail = new HttpRequestException("down");

        var result = await Receive(Request(Event("e1")));

        Assert.Equal(502, Assert.IsType<ProblemHttpResult>(result.Result).StatusCode);
        Assert.Empty(_db.ContactMessages);
    }

    [Fact]
    public void A_signature_among_several_counts_and_any_other_version_doesn_t()
    {
        var good = Sign("msg_1", Now.ToUnixTimeSeconds(), "{}", Secret);
        var stamp = Now.ToUnixTimeSeconds().ToString();

        Assert.True(InboundEmail.SignatureValid("msg_1", stamp, $"v1,bm9wZQ== v1,{good}", "{}", Secret, Now));
        Assert.False(InboundEmail.SignatureValid("msg_1", stamp, $"v2,{good}", "{}", Secret, Now));
        Assert.False(InboundEmail.SignatureValid("msg_2", stamp, $"v1,{good}", "{}", Secret, Now));
        Assert.False(InboundEmail.SignatureValid("msg_1", stamp, $"v1,{good}", "{ }", Secret, Now));
        Assert.False(InboundEmail.SignatureValid(null, stamp, $"v1,{good}", "{}", Secret, Now));
        Assert.False(InboundEmail.SignatureValid("msg_1", "soon", $"v1,{good}", "{}", Secret, Now));
        Assert.False(InboundEmail.SignatureValid("msg_1", stamp, null, "{}", Secret, Now));
    }

    [Fact]
    public void A_secret_pasted_without_its_prefix_or_not_in_base64_still_checks()
    {
        var stamp = Now.ToUnixTimeSeconds();
        var key = Convert.ToBase64String("inbound-secret"u8.ToArray());
        var withoutPrefix = Sign("msg_1", stamp, "{}", Secret);
        var plain = Convert.ToBase64String(HMACSHA256.HashData("not base64!"u8.ToArray(), Encoding.UTF8.GetBytes($"msg_1.{stamp}.{{}}")));

        Assert.True(InboundEmail.SignatureValid("msg_1", stamp.ToString(), $"v1,{withoutPrefix}", "{}", key, Now));
        Assert.True(InboundEmail.SignatureValid("msg_1", stamp.ToString(), $"v1,{plain}", "{}", "not base64!", Now));
    }

    // ---------- Only what they wrote ----------

    [Theory]
    [InlineData("Sounds good.\n\nOn Thu, 22 Oct 2026 at 10:00, Claudiu <hello@jechel.dev> wrote:\n> Hi Ada", "Sounds good.")]
    [InlineData("Sounds good.\r\n\r\nOn Thu, 22 Oct 2026 at 10:00, Claudiu from jechel.dev <\r\nhello@jechel.dev> wrote:\r\n\r\n> Hi Ada", "Sounds good.")]
    [InlineData("Sounds good.\n\nOn 22 Oct 2026, at 10:00, Claudiu <hello@jechel.dev> wrote:\n\n> Hi", "Sounds good.")]
    [InlineData("Sună bine.\n\nÎn joi, 22 oct. 2026 la 10:00, Claudiu <hello@jechel.dev> a scris:\n> Salut", "Sună bine.")]
    [InlineData("Ça marche.\n\nLe jeu. 22 oct. 2026 à 10:00, Claudiu <hello@jechel.dev> a écrit :\n> Salut", "Ça marche.")]
    [InlineData("Fine.\n\n-----Original Message-----\nFrom: Claudiu\nHi", "Fine.")]
    [InlineData("Fine.\n\n________________________________\nFrom: Claudiu <hello@jechel.dev>\nSent: Thursday", "Fine.")]
    [InlineData("Fine.\n\nFrom: Claudiu <hello@jechel.dev>\nSent: Thursday, 22 October 2026 10:00\nTo: Ada", "Fine.")]
    [InlineData("Fine.\n\n> Hi Ada\n> How are you?\n", "Fine.")]
    [InlineData("Here is what I wrote:\nthe plan", "Here is what I wrote:\nthe plan")]
    [InlineData("> I said\nAnd I agree", "> I said\nAnd I agree")]
    [InlineData("One\n\n\n\nTwo   \n", "One\n\nTwo")]
    // A line just above a wrapped header stays; so does a sentence ending in "wrote:" with neither an address nor a year.
    [InlineData("Thanks for 2 things\nOn Thu, 22 Oct 2026 at 10:00, Claudiu from jechel.dev <\nhello@jechel.dev> wrote:\n> Hi", "Thanks for 2 things")]
    [InlineData("Thanks for 2 things\nOn Thu, 22 Oct 2026 at 10:00, Claudiu <hello@jechel.dev> wrote:\n> Hi", "Thanks for 2 things")]
    [InlineData("I sent 2 drafts. This is what I wrote:\nthe plan", "I sent 2 drafts. This is what I wrote:\nthe plan")]
    [InlineData("On Thursday, Claudiu wrote:\n> Hi", "On Thursday, Claudiu wrote:")]
    [InlineData("See you then.\n\n-- \nAda Lovelace\nAnalytical Engines Ltd", "See you then.")]
    [InlineData("See you then.\n\nSent from my iPhone\n\nOn 22 Oct 2026, at 10:00, Claudiu <hello@jechel.dev> wrote:\n> Hi", "See you then.")]
    [InlineData("See you then.\nGet Outlook for Android", "See you then.")]
    [InlineData("Sent from my iPhone? No, from my laptop.", "Sent from my iPhone? No, from my laptop.")]
    [InlineData("Notes\n____________\nthe rest", "Notes\n____________\nthe rest")]
    [InlineData("Fine.\n\n-----Original Message-----", "Fine.")]
    [InlineData("", "")]
    public void The_quoted_email_they_answered_is_left_out(string text, string expected) =>
        Assert.Equal(expected, InboundEmail.WithoutQuote(text));

    [Fact]
    public void Html_becomes_text_up_to_the_quote()
    {
        const string html = """
            <html><head><style>p{color:red}</style></head><body>
            <div dir="ltr">Tuesday &amp; Wednesday<br>both&nbsp;work</div><div><br></div><p>Ada</p>
            <div class="gmail_quote"><div class="gmail_attr">On Thu, Claudiu wrote:</div><blockquote>Hi Ada</blockquote></div>
            </body></html>
            """;

        Assert.Equal("Tuesday & Wednesday\nboth work\n\nAda", InboundEmail.HtmlToText(html));
        Assert.Equal("Yes", InboundEmail.HtmlToText("<p>Yes</p><blockquote type=\"cite\">Earlier</blockquote>"));
    }

    [Fact]
    public void The_text_is_preferred_and_attachments_are_noted_not_kept()
    {
        Assert.Equal("Plain", InboundEmail.MessageOf(new ReceivedEmail("a@b.c", null, "Plain", "<p>Html</p>", null, null, false, 0)));
        Assert.Equal("Html", InboundEmail.MessageOf(new ReceivedEmail("a@b.c", null, null, "<p>Html</p>", null, null, false, 0)));
        Assert.Equal("See attached\n\n(1 attachment, not shown: it's in Resend)", InboundEmail.MessageOf(new ReceivedEmail("a@b.c", null, "See attached", null, null, null, false, 1)));
        Assert.Equal("(3 attachments, not shown: they're in Resend)", InboundEmail.MessageOf(new ReceivedEmail("a@b.c", null, null, null, null, null, false, 3)));
        Assert.Equal("(No text)", InboundEmail.MessageOf(new ReceivedEmail("a@b.c", null, "  \n> quoted only", null, null, null, false, 0)));
    }

    [Theory]
    [InlineData("Ada", "Hi Ada,")]
    [InlineData("  Ada  ", "Hi Ada,")]
    [InlineData("ada@example.com", "Hi,")]
    [InlineData("", "Hi,")]
    public void Someone_known_only_by_their_address_is_greeted_without_it(string name, string expected)
    {
        Assert.Equal(expected, PersonalEmails.Greeting(name));
        Assert.StartsWith(expected + "\n\n", PersonalEmails.Reply("ada@example.com", name, "Thanks", "Hello").Text);
    }

    [Theory]
    [InlineData("Claudiu <hello@jechel.dev>", "whsec_x", null)]
    [InlineData("Claudiu <hello@jechel.dev>", "", "me@example.com")]
    [InlineData("jechel.dev <onboarding@resend.dev>", "whsec_x", "me@example.com")]
    [InlineData("", "whsec_x", "me@example.com")]
    public void Answers_ask_for_replies_to_the_admin_until_the_site_receives_them(string from, string secret, string? expected) =>
        Assert.Equal(expected, ContactEndpoints.ReplyToFor(new EmailOptions { From = from, InboundWebhookSecret = secret }, new Portfolio.Api.Features.Auth.AdminOptions { AdminEmails = ["me@example.com"] }));

    [Theory]
    [InlineData(null, "Re: your message to jechel.dev")]
    [InlineData("  ", "Re: your message to jechel.dev")]
    [InlineData("A question", "Re: A question")]
    [InlineData("RE: A question", "RE: A question")]
    public void The_answer_s_subject_is_Re_theirs_once(string? subject, string expected) =>
        Assert.Equal(expected, PersonalEmails.ReplySubject(subject));
}

public class ResendInboxTests
{
    private sealed class FakeResend(HttpStatusCode status, string body) : HttpMessageHandler
    {
        public HttpRequestMessage? Request { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Request = request;
            return Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") });
        }
    }

    private static async Task<(ReceivedEmail Email, HttpRequestMessage Request)> Read(string body)
    {
        var resend = new FakeResend(HttpStatusCode.OK, body);
        var inbox = new ResendInbox(new HttpClient(resend) { BaseAddress = ResendEmailSender.BaseAddress }, TestOptions.Monitor(new EmailOptions { ResendApiKey = " re_key " }));
        return (await inbox.GetAsync("e/1", default), resend.Request!);
    }

    [Fact]
    public async Task Reads_the_email_with_the_API_key()
    {
        var (email, request) = await Read("""
            {"object":"email","id":"e1","from":"Ada <ada@example.com>","to":["hello@jechel.dev"],"subject":"Hi","text":"Hello","html":"<p>Hello</p>",
             "message_id":"<abc@mail.example.com>","headers":{"from":"Ada <ada@example.com>"},"authentication":{"spf":"pass","dkim":"pass","dmarc":"pass"},
             "attachments":[{"id":"a1","filename":"cv.pdf"}]}
            """);

        Assert.Equal(new ReceivedEmail("Ada <ada@example.com>", "Hi", "Hello", "<p>Hello</p>", "<abc@mail.example.com>", "pass", false, 1), email);
        Assert.Equal("https://api.resend.com/emails/receiving/e%2F1", request.RequestUri!.ToString());
        Assert.Equal("Bearer re_key", request.Headers.Authorization!.ToString());
    }

    [Theory]
    [InlineData("""{"auto-submitted":"auto-replied"}""", true)]
    [InlineData("""{"auto-submitted":"no"}""", false)]
    [InlineData("""{"precedence":"bulk"}""", true)]
    [InlineData("""{"precedence":"auto_reply"}""", true)]
    [InlineData("""{}""", false)]
    public async Task Knows_an_email_sent_by_a_program(string headers, bool automatic)
    {
        var (email, _) = await Read($$"""{"from":"ada@example.com","headers":{{headers}},"authentication":null}""");

        Assert.Equal(automatic, email.Automatic);
        Assert.Null(email.Dmarc);
        Assert.Equal(0, email.Attachments);
    }

    [Theory]
    [InlineData(HttpStatusCode.NotFound, """{"message":"Email not found"}""", "Resend refused it: Email not found")]
    [InlineData(HttpStatusCode.Unauthorized, "", "Resend refused it: 401 Unauthorized")]
    [InlineData(HttpStatusCode.OK, "[]", "Resend's answer wasn't an email.")]
    [InlineData(HttpStatusCode.OK, "<html>", "Resend's answer wasn't an email.")]
    public async Task Says_why_when_it_can_t(HttpStatusCode status, string body, string expected)
    {
        var inbox = new ResendInbox(new HttpClient(new FakeResend(status, body)) { BaseAddress = ResendEmailSender.BaseAddress }, TestOptions.Monitor(new EmailOptions()));

        Assert.Equal(expected, (await Assert.ThrowsAsync<ServiceException>(() => inbox.GetAsync("e1", default))).Message);
    }
}
