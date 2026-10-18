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

    private ContactMessage Seed(string name, DateTimeOffset receivedAt, DateTimeOffset? readAt = null)
    {
        var message = new ContactMessage
        {
            Name = name,
            Email = $"{name.ToLowerInvariant()}@example.com",
            Message = LongMessage,
            ReceivedAt = receivedAt,
            ReadAt = readAt,
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

        var result = await ContactEndpoints.Reply(seeded.Id, new ReplyRequest("  Thanks, let's talk!  "), _db, emails, admins, _time, CancellationToken.None);

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

        Assert.IsType<ValidationProblem>((await ContactEndpoints.Reply(seeded.Id, new ReplyRequest(" "), _db, emails, admins, _time, CancellationToken.None)).Result);
        emails.FailWith = new Portfolio.Api.Features.Settings.ServiceException("Resend refused it: domain not verified");
        var failed = await ContactEndpoints.Reply(seeded.Id, new ReplyRequest("Hi"), _db, emails, admins, _time, CancellationToken.None);

        var problem = Assert.IsType<ProblemHttpResult>(failed.Result);
        Assert.Equal(503, problem.StatusCode);
        Assert.Equal("Resend refused it: domain not verified", problem.ProblemDetails.Detail);
        Assert.Empty(_db.ContactReplies);
    }
}
