using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Contact;
using Portfolio.Api.Features.Updates;
using Portfolio.Api.UnitTests.Features.Alerts;

namespace Portfolio.Api.UnitTests.Features.Contact;

public class ContactEndpointsTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 8, 12, 0, 0, TimeSpan.Zero);

    private readonly FakeTimeProvider _time = new(Now);
    private readonly FakePhoneAlerts _alerts = new();
    private readonly PortfolioDbContext _db = new(new DbContextOptionsBuilder<PortfolioDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    private static readonly string LongMessage = new('m', ContactRules.MessageMinLength);
    // Not receiving email yet: answers ask to reply to the admin's own address.
    private static readonly TestOptions<EmailOptions> NotReceiving = TestOptions.Monitor(new EmailOptions { From = "Claudiu <hello@jechel.dev>" });
    private static readonly TestOptions<EmailOptions> Receiving = TestOptions.Monitor(new EmailOptions { From = "Claudiu <hello@jechel.dev>", InboundWebhookSecret = "whsec_c2VjcmV0" });

    private ContactMessage Seed(string name, DateTimeOffset receivedAt, DateTimeOffset? readAt = null)
    {
        var message = new ContactMessage
        {
            Name = name,
            Email = $"{name.ToLowerInvariant()}@example.com",
            Message = LongMessage,
            ReceivedAt = receivedAt,
            ReadAt = readAt,
            LastActivityAt = receivedAt,
        };
        _db.ContactMessages.Add(message);
        _db.SaveChanges();
        return message;
    }

    [Fact]
    public async Task SendMessage_stores_the_trimmed_message_with_the_current_time()
    {
        var request = new SendMessageRequest("  Ada  ", " ada@example.com ", $"  {LongMessage}  ");

        var result = await ContactEndpoints.SendMessage(request, _db, _time, _alerts, CancellationToken.None);

        Assert.IsType<Created>(result.Result);
        var stored = await _db.ContactMessages.SingleAsync();
        Assert.Equal("Ada", stored.Name);
        Assert.Equal("ada@example.com", stored.Email);
        Assert.Equal(LongMessage, stored.Message);
        Assert.Equal(Now, stored.ReceivedAt);
        Assert.Null(stored.ReadAt);
        var alert = Assert.Single(_alerts.Sent);
        Assert.Equal("New message from Ada", alert.Title);
        Assert.Equal("/contact", alert.Path);
    }

    [Fact]
    public async Task SendMessage_keeps_a_project_enquiry_as_one_subject_and_alert_and_inbox_say()
    {
        var result = await ContactEndpoints.SendMessage(new SendMessageRequest("Ada", "ada@example.com", LongMessage, "project"), _db, _time, _alerts, CancellationToken.None);

        Assert.IsType<Created>(result.Result);
        Assert.Equal("Project enquiry", (await _db.ContactMessages.SingleAsync()).Subject);
        Assert.Equal("New project enquiry from Ada", Assert.Single(_alerts.Sent).Title);
        var listed = Assert.Single((await ContactEndpoints.ListMessages(_db, CancellationToken.None)).Value!.Items);
        Assert.Equal("Project enquiry", listed.Subject);
    }

    [Fact]
    public async Task SendMessage_about_anything_has_no_subject()
    {
        foreach (var topic in new[] { null, "" })
        {
            await ContactEndpoints.SendMessage(new SendMessageRequest("Ada", "ada@example.com", LongMessage, topic), _db, _time, _alerts, CancellationToken.None);
        }

        Assert.All(await _db.ContactMessages.ToListAsync(), m => Assert.Null(m.Subject));
        Assert.All(_alerts.Sent, a => Assert.Equal("New message from Ada", a.Title));
        Assert.All((await ContactEndpoints.ListMessages(_db, CancellationToken.None)).Value!.Items, m => Assert.Null(m.Subject));
    }

    [Fact]
    public async Task SendMessage_rejects_an_invalid_request_and_stores_nothing()
    {
        var result = await ContactEndpoints.SendMessage(new SendMessageRequest("Ada", "nope", "too short"), _db, _time, _alerts, CancellationToken.None);

        var problem = Assert.IsType<ValidationProblem>(result.Result);
        Assert.Equal(["email", "message"], problem.ProblemDetails.Errors.Keys.Order());
        Assert.Empty(_db.ContactMessages);
        Assert.Empty(_alerts.Sent);
    }

    [Fact]
    public async Task ListMessages_returns_a_page_newest_first_with_read_state()
    {
        for (var i = 1; i <= 12; i++)
        {
            Seed($"Sender{i:00}", Now.AddMinutes(i), readAt: i % 2 == 0 ? Now : null);
        }

        var first = (await ContactEndpoints.ListMessages(_db, CancellationToken.None, page: 1, pageSize: 5)).Value!;
        var last = (await ContactEndpoints.ListMessages(_db, CancellationToken.None, page: 3, pageSize: 5)).Value!;

        Assert.Equal(12, first.TotalCount);
        Assert.Equal(["Sender12", "Sender11", "Sender10", "Sender09", "Sender08"], first.Items.Select(m => m.Name));
        Assert.Equal([true, false, true, false, true], first.Items.Select(m => m.IsRead));
        Assert.Equal(["Sender02", "Sender01"], last.Items.Select(m => m.Name));
        Assert.Equal(3, last.Page);
    }

    [Theory]
    [InlineData(0, 0, 1, 1)]
    [InlineData(-5, 500, 1, ContactEndpoints.MaxPageSize)]
    public async Task ListMessages_clamps_page_and_page_size(int page, int pageSize, int expectedPage, int expectedPageSize)
    {
        var result = (await ContactEndpoints.ListMessages(_db, CancellationToken.None, page, pageSize)).Value!;

        Assert.Equal(expectedPage, result.Page);
        Assert.Equal(expectedPageSize, result.PageSize);
    }

    [Fact]
    public async Task ListMessages_beyond_the_last_page_is_empty()
    {
        Seed("Ada", Now);

        var result = (await ContactEndpoints.ListMessages(_db, CancellationToken.None, page: 2)).Value!;

        Assert.Empty(result.Items);
        Assert.Equal(1, result.TotalCount);
    }

    [Fact]
    public async Task GetMessage_returns_every_detail_without_marking_it_read()
    {
        var seeded = Seed("Ada", Now);

        var result = await ContactEndpoints.GetMessage(seeded.Id, _db, CancellationToken.None);

        var details = Assert.IsType<Ok<ContactMessageDetails>>(result.Result).Value!;
        Assert.Equal((seeded.Id, "Ada", "ada@example.com", LongMessage, Now, (DateTimeOffset?)null), (details.Id, details.Name, details.Email, details.Message, details.ReceivedAt, details.ReadAt));
        Assert.Empty(details.Replies);
        Assert.Empty(details.Meetings);
        Assert.Null((await _db.ContactMessages.AsNoTracking().SingleAsync()).ReadAt);
    }

    [Fact]
    public async Task GetMessage_returns_not_found_for_an_unknown_id()
    {
        Assert.IsType<NotFound>((await ContactEndpoints.GetMessage(404, _db, CancellationToken.None)).Result);
    }

    [Fact]
    public async Task MarkAsRead_sets_the_read_time_once()
    {
        var seeded = Seed("Ada", Now.AddHours(-1));

        Assert.IsType<NoContent>((await ContactEndpoints.MarkAsRead(seeded.Id, _db, _time, CancellationToken.None)).Result);
        _time.Advance(TimeSpan.FromHours(1));
        Assert.IsType<NoContent>((await ContactEndpoints.MarkAsRead(seeded.Id, _db, _time, CancellationToken.None)).Result);

        Assert.Equal(Now, (await _db.ContactMessages.SingleAsync()).ReadAt);
    }

    [Fact]
    public async Task MarkAsRead_returns_not_found_for_an_unknown_id()
    {
        Assert.IsType<NotFound>((await ContactEndpoints.MarkAsRead(404, _db, _time, CancellationToken.None)).Result);
    }

    [Fact]
    public async Task DeleteMessage_removes_only_that_message()
    {
        var kept = Seed("Kept", Now);
        var deleted = Seed("Deleted", Now);

        Assert.IsType<NoContent>((await ContactEndpoints.DeleteMessage(deleted.Id, _db, CancellationToken.None)).Result);

        Assert.Equal([kept.Id], _db.ContactMessages.Select(m => m.Id));
        Assert.IsType<NotFound>((await ContactEndpoints.DeleteMessage(deleted.Id, _db, CancellationToken.None)).Result);
    }

    [Fact]
    public async Task Reply_emails_the_sender_with_the_message_quoted_and_keeps_it_with_the_message()
    {
        var seeded = Seed("Ada", Now);
        var emails = new Updates.FakeEmailSender();
        var admins = TestOptions.Monitor(new Portfolio.Api.Features.Auth.AdminOptions { AdminEmails = ["me@example.com"] });

        var result = await ContactEndpoints.Reply(seeded.Id, new ReplyRequest("  Thanks, let's talk!  "), _db, emails, admins, NotReceiving, _time, CancellationToken.None);

        Assert.IsType<Ok<ContactReplyDto>>(result.Result);
        var email = Assert.Single(emails.Sent);
        Assert.Equal(("ada@example.com", "me@example.com"), (email.To, email.ReplyTo));
        Assert.Contains("Thanks, let's talk!", email.Text);
        Assert.Contains("> " + LongMessage[..20], email.Text);
        var details = Assert.IsType<Ok<ContactMessageDetails>>((await ContactEndpoints.GetMessage(seeded.Id, _db, CancellationToken.None)).Result).Value!;
        Assert.Equal("Thanks, let's talk!", Assert.Single(details.Replies).Text);
        Assert.Equal(Now, details.ReadAt);
    }

    [Fact]
    public async Task Reply_refuses_an_empty_answer_and_says_when_it_cant_be_sent()
    {
        var seeded = Seed("Ada", Now);
        var emails = new Updates.FakeEmailSender();
        var admins = TestOptions.Monitor(new Portfolio.Api.Features.Auth.AdminOptions());

        Assert.IsType<ValidationProblem>((await ContactEndpoints.Reply(seeded.Id, new ReplyRequest(" "), _db, emails, admins, NotReceiving, _time, CancellationToken.None)).Result);
        emails.FailWith = new Portfolio.Api.Features.Settings.ServiceException("Resend refused it: domain not verified");
        var failed = await ContactEndpoints.Reply(seeded.Id, new ReplyRequest("Hi"), _db, emails, admins, NotReceiving, _time, CancellationToken.None);

        var problem = Assert.IsType<ProblemHttpResult>(failed.Result);
        Assert.Equal(503, problem.StatusCode);
        Assert.Equal("Resend refused it: domain not verified", problem.ProblemDetails.Detail);
        Assert.Empty(_db.ContactReplies);
    }

    // ---------- Conversations ----------

    private static readonly Portfolio.Api.Features.Auth.AdminOptions Admin = new() { AdminEmails = ["me@example.com"] };

    private async Task<ContactReplyDto> Answer(ContactMessage message, string text, Updates.FakeEmailSender? emails = null, TestOptions<EmailOptions>? email = null) =>
        Assert.IsType<Ok<ContactReplyDto>>((await ContactEndpoints.Reply(message.Id, new ReplyRequest(text), _db, emails ?? new Updates.FakeEmailSender(), TestOptions.Monitor(Admin), email ?? Receiving, _time, default)).Result).Value!;

    /// <summary>The visitor's emailed answer, as <see cref="InboundEmail"/> keeps it.</summary>
    private void TheyWrite(ContactMessage message, string text, string? messageId = null)
    {
        _db.ContactReplies.Add(new ContactReply { MessageId = message.Id, Text = text, SentAt = _time.GetUtcNow(), FromVisitor = true, EmailMessageId = messageId });
        _db.SaveChanges();
    }

    [Fact]
    public async Task A_new_message_starts_a_conversation()
    {
        await ContactEndpoints.SendMessage(new SendMessageRequest("Ada", "ada@example.com", LongMessage), _db, _time, _alerts, default);

        var stored = _db.ContactMessages.Single();
        Assert.Equal((Now, (string?)null, (string?)null), (stored.LastActivityAt, stored.Subject, stored.EmailId));
    }

    [Fact]
    public async Task Once_the_site_receives_email_the_answer_is_replied_to_at_the_site_s_address_with_no_link()
    {
        var message = Seed("Ada", Now);
        var emails = new Updates.FakeEmailSender();

        await Answer(message, "Thanks, let's talk!", emails);

        var email = Assert.Single(emails.Sent);
        // No Reply-To: their answer goes to the sender, hello@, and lands in the conversation.
        Assert.Null(email.ReplyTo);
        Assert.Equal(Portfolio.Api.Features.Meetings.PersonalEmails.DefaultSubject, email.Subject);
        Assert.DoesNotContain("http", email.Text);
        Assert.DoesNotContain("<a ", email.Html);
        Assert.False(email.FromUpdates);
    }

    [Fact]
    public async Task Until_the_site_receives_email_the_answer_asks_them_to_reply_to_the_admin()
    {
        var message = Seed("Ada", Now);
        var emails = new Updates.FakeEmailSender();

        await Answer(message, "Hi", emails, NotReceiving);
        await Answer(message, "Hi", emails, TestOptions.Monitor(new EmailOptions { InboundWebhookSecret = "whsec_c2VjcmV0", From = "not an address" }));

        Assert.All(emails.Sent, e => Assert.Equal("me@example.com", e.ReplyTo));
    }

    [Fact]
    public async Task An_answer_to_a_conversation_started_by_email_keeps_its_subject_and_thread()
    {
        var message = Seed("Ada", Now);
        message.Subject = "Website question";
        message.EmailMessageId = "<first@mail.example.com>";
        _db.SaveChanges();
        var emails = new Updates.FakeEmailSender();

        await Answer(message, "Happy to help", emails);
        TheyWrite(message, "Great, Tuesday?", "<second@mail.example.com>");
        await Answer(message, "Tuesday it is", emails);

        Assert.Equal(["Re: Website question", "Re: Website question"], emails.Sent.Select(e => e.Subject));
        Assert.Equal(["<first@mail.example.com>", "<second@mail.example.com>"], emails.Sent.Select(e => e.InReplyTo));
        Assert.Contains("> Great, Tuesday?", emails.Sent[1].Text);
        Assert.Equal("Website question", Assert.IsType<Ok<ContactMessageDetails>>((await ContactEndpoints.GetMessage(message.Id, _db, default)).Result).Value!.Subject);
    }

    [Fact]
    public async Task An_answer_to_the_form_has_no_thread_until_they_email_back()
    {
        var message = Seed("Ada", Now);
        var emails = new Updates.FakeEmailSender();

        await Answer(message, "First", emails);
        TheyWrite(message, "Reply without an id");
        await Answer(message, "Second", emails);

        Assert.All(emails.Sent, e => Assert.Null(e.InReplyTo));
    }

    [Fact]
    public async Task The_admin_sees_who_wrote_each_message_in_order_and_answers_what_they_wrote_last()
    {
        var message = Seed("Ada", Now);
        _time.Advance(TimeSpan.FromMinutes(1));
        await Answer(message, "First answer");
        _time.Advance(TimeSpan.FromMinutes(1));
        TheyWrite(message, "Their follow-up");
        _time.Advance(TimeSpan.FromMinutes(1));
        var emails = new Updates.FakeEmailSender();
        await Answer(message, "Second answer", emails);

        var details = Assert.IsType<Ok<ContactMessageDetails>>((await ContactEndpoints.GetMessage(message.Id, _db, default)).Result).Value!;
        Assert.Equal([("First answer", false), ("Their follow-up", true), ("Second answer", false)], details.Replies.Select(r => (r.Text, r.FromVisitor)));
        // Quoted under the answer: their follow-up, not their first message.
        Assert.Contains("> Their follow-up", Assert.Single(emails.Sent).Text);
        Assert.Equal(Now.AddMinutes(3), _db.ContactMessages.Single().LastActivityAt);
    }

    [Fact]
    public async Task Deleting_a_conversation_deletes_every_message_in_it()
    {
        var message = Seed("Ada", Now);
        await Answer(message, "Hi");
        TheyWrite(message, "Hello");

        await ContactEndpoints.DeleteMessage(message.Id, _db, default);

        Assert.Empty(_db.ContactReplies);
    }
}
