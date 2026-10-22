using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Contact;
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
    private static readonly Microsoft.Extensions.Options.IOptions<Portfolio.Api.Features.Alerts.SiteOptions> Site =
        Microsoft.Extensions.Options.Options.Create(new Portfolio.Api.Features.Alerts.SiteOptions { PublicUrl = "https://jechel.dev" });

    private ContactMessage Seed(string name, DateTimeOffset receivedAt, DateTimeOffset? readAt = null)
    {
        var message = new ContactMessage
        {
            Name = name,
            Email = $"{name.ToLowerInvariant()}@example.com",
            Message = LongMessage,
            ReceivedAt = receivedAt,
            ReadAt = readAt,
            Token = $"token-{name}",
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

        var result = await ContactEndpoints.Reply(seeded.Id, new ReplyRequest("  Thanks, let's talk!  "), _db, emails, admins, Site, _time, CancellationToken.None);

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

        Assert.IsType<ValidationProblem>((await ContactEndpoints.Reply(seeded.Id, new ReplyRequest(" "), _db, emails, admins, Site, _time, CancellationToken.None)).Result);
        emails.FailWith = new Portfolio.Api.Features.Settings.ServiceException("Resend refused it: domain not verified");
        var failed = await ContactEndpoints.Reply(seeded.Id, new ReplyRequest("Hi"), _db, emails, admins, Site, _time, CancellationToken.None);

        var problem = Assert.IsType<ProblemHttpResult>(failed.Result);
        Assert.Equal(503, problem.StatusCode);
        Assert.Equal("Resend refused it: domain not verified", problem.ProblemDetails.Detail);
        Assert.Empty(_db.ContactReplies);
    }

    // ---------- Conversations ----------

    private static readonly Portfolio.Api.Features.Auth.AdminOptions Admin = new() { AdminEmails = ["me@example.com"] };

    private async Task<ContactReplyDto> Answer(ContactMessage message, string text, Updates.FakeEmailSender? emails = null) =>
        Assert.IsType<Ok<ContactReplyDto>>((await ContactEndpoints.Reply(message.Id, new ReplyRequest(text), _db, emails ?? new Updates.FakeEmailSender(), TestOptions.Monitor(Admin), Site, _time, default)).Result).Value!;

    private async Task<ConversationDto> WriteBack(string token, string text) =>
        Assert.IsType<Ok<ConversationDto>>((await ContactEndpoints.WriteBack(token, new ReplyRequest(text), _db, _alerts, _time, default)).Result).Value!;

    private async Task<ConversationDto> Conversation(string token) =>
        Assert.IsType<Ok<ConversationDto>>((await ContactEndpoints.GetConversation(token, _db, default)).Result).Value!;

    [Fact]
    public async Task A_new_message_gets_its_own_long_random_link_and_starts_the_conversation()
    {
        await ContactEndpoints.SendMessage(new SendMessageRequest("Ada", "ada@example.com", LongMessage), _db, _time, _alerts, default);
        await ContactEndpoints.SendMessage(new SendMessageRequest("Bob", "bob@example.com", LongMessage), _db, _time, _alerts, default);

        var stored = _db.ContactMessages.OrderBy(m => m.Id).ToList();
        Assert.All(stored, m => Assert.Matches("^[A-Za-z0-9_-]{43}$", m.Token));
        Assert.NotEqual(stored[0].Token, stored[1].Token);
        Assert.All(stored, m => Assert.Equal(Now, m.LastActivityAt));
    }

    [Fact]
    public async Task The_answer_email_has_a_button_to_the_conversation_and_still_reaches_the_admin_if_answered()
    {
        var message = Seed("Ada", Now);
        var emails = new Updates.FakeEmailSender();

        await Answer(message, "Thanks, let's talk!", emails);

        var email = Assert.Single(emails.Sent);
        Assert.Contains(">Reply on jechel.dev</a>", email.Html);
        Assert.Contains("href=\"https://jechel.dev/contact/conversation?token=token-Ada\"", email.Html);
        Assert.Contains("Reply on jechel.dev: https://jechel.dev/contact/conversation?token=token-Ada", email.Text);
        Assert.Equal("me@example.com", email.ReplyTo);
        Assert.False(email.FromUpdates);
    }

    [Fact]
    public async Task The_visitor_reads_the_whole_conversation_with_the_link_their_name_but_not_their_address()
    {
        var message = Seed("Ada", Now);
        _time.Advance(TimeSpan.FromMinutes(5));
        await Answer(message, "Hi Ada!");

        var conversation = await Conversation("token-Ada");

        Assert.Equal("Ada", conversation.Name);
        Assert.Equal([(LongMessage, Now, true), ("Hi Ada!", Now.AddMinutes(5), false)], conversation.Messages.Select(m => (m.Text, m.At, m.FromVisitor)));
        Assert.DoesNotContain("@", System.Text.Json.JsonSerializer.Serialize(conversation));
    }

    [Fact]
    public async Task Writing_back_keeps_it_in_the_thread_makes_it_unread_and_newest_and_rings_the_phone()
    {
        var older = Seed("Ada", Now, readAt: Now);
        _time.Advance(TimeSpan.FromHours(1));
        Seed("Bob", _time.GetUtcNow());
        _time.Advance(TimeSpan.FromHours(1));

        var conversation = await WriteBack("token-Ada", "  Sounds good, Tuesday?  ");

        Assert.Equal(("Sounds good, Tuesday?", true), (conversation.Messages[^1].Text, conversation.Messages[^1].FromVisitor));
        var stored = _db.ContactMessages.Single(m => m.Id == older.Id);
        Assert.Null(stored.ReadAt);
        Assert.Equal(Now.AddHours(2), stored.LastActivityAt);
        var inbox = (await ContactEndpoints.ListMessages(_db, default)).Value!.Items;
        Assert.Equal(["Ada", "Bob"], inbox.Select(m => m.Name));
        Assert.Equal((false, 2), (inbox[0].IsRead, inbox[0].Count));
        var alert = Assert.Single(_alerts.Sent);
        Assert.Equal(("New reply from Ada", "Sounds good, Tuesday?", "/contact", Portfolio.Api.Features.Alerts.AlertKinds.Message), (alert.Title, alert.Message, alert.Path, alert.Kind));
    }

    [Fact]
    public async Task The_admin_sees_who_wrote_each_message_in_order_and_answers_what_they_wrote_last()
    {
        var message = Seed("Ada", Now);
        _time.Advance(TimeSpan.FromMinutes(1));
        await Answer(message, "First answer");
        _time.Advance(TimeSpan.FromMinutes(1));
        await WriteBack("token-Ada", "Their follow-up");
        _time.Advance(TimeSpan.FromMinutes(1));
        var emails = new Updates.FakeEmailSender();
        await Answer(message, "Second answer", emails);

        var details = Assert.IsType<Ok<ContactMessageDetails>>((await ContactEndpoints.GetMessage(message.Id, _db, default)).Result).Value!;
        Assert.Equal([("First answer", false), ("Their follow-up", true), ("Second answer", false)], details.Replies.Select(r => (r.Text, r.FromVisitor)));
        // Quoted under the answer: their follow-up, not their first message.
        Assert.Contains("> Their follow-up", Assert.Single(emails.Sent).Text);
        Assert.Equal(Now.AddMinutes(3), _db.ContactMessages.Single().LastActivityAt);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Writing_back_needs_some_words(string text)
    {
        Seed("Ada", Now);

        var result = await ContactEndpoints.WriteBack("token-Ada", new ReplyRequest(text), _db, _alerts, _time, default);

        Assert.Equal("Write your message first.", Assert.Single(Assert.IsType<ValidationProblem>(result.Result).ProblemDetails.Errors["text"]));
        Assert.Empty(_db.ContactReplies);
        Assert.Empty(_alerts.Sent);
    }

    [Fact]
    public async Task Writing_back_is_kept_to_2000_characters()
    {
        Seed("Ada", Now);

        var tooLong = await ContactEndpoints.WriteBack("token-Ada", new ReplyRequest(new string('x', ContactEndpoints.WriteBackMaxLength + 1)), _db, _alerts, _time, default);
        var justRight = await ContactEndpoints.WriteBack("token-Ada", new ReplyRequest(new string('x', ContactEndpoints.WriteBackMaxLength)), _db, _alerts, _time, default);

        Assert.IsType<ValidationProblem>(tooLong.Result);
        Assert.IsType<Ok<ConversationDto>>(justRight.Result);
    }

    [Theory]
    [InlineData("nope")]
    [InlineData("")]
    [InlineData("token-Ad")]
    public async Task A_link_that_matches_no_conversation_finds_nothing_and_writes_nothing(string token)
    {
        Seed("Ada", Now);

        Assert.IsType<NotFound>((await ContactEndpoints.GetConversation(token, _db, default)).Result);
        Assert.IsType<NotFound>((await ContactEndpoints.WriteBack(token, new ReplyRequest("Hello"), _db, _alerts, _time, default)).Result);
        Assert.Empty(_db.ContactReplies);
    }

    [Fact]
    public async Task A_link_longer_than_any_real_one_isnt_looked_up_and_spaces_around_one_are_fine()
    {
        Seed("Ada", Now);

        Assert.IsType<NotFound>((await ContactEndpoints.GetConversation("token-Ada" + new string('x', 100), _db, default)).Result);
        Assert.IsType<Ok<ConversationDto>>((await ContactEndpoints.GetConversation(" token-Ada ", _db, default)).Result);
    }

    [Fact]
    public async Task Once_the_admin_deletes_it_the_link_finds_nothing()
    {
        var message = Seed("Ada", Now);
        await WriteBack("token-Ada", "Still there?");

        await ContactEndpoints.DeleteMessage(message.Id, _db, default);

        Assert.IsType<NotFound>((await ContactEndpoints.GetConversation("token-Ada", _db, default)).Result);
    }

    [Fact]
    public async Task One_conversations_link_never_shows_or_writes_in_another()
    {
        Seed("Ada", Now);
        Seed("Bob", Now);

        await WriteBack("token-Bob", "Bob here");

        Assert.Single((await Conversation("token-Ada")).Messages);
        Assert.Equal(["Bob here"], (await Conversation("token-Bob")).Messages.Skip(1).Select(m => m.Text));
    }
}
