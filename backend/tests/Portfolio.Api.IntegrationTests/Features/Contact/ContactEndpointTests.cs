using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Portfolio.Api.Features.Contact;

namespace Portfolio.Api.IntegrationTests.Features.Contact;

/// <summary>
/// Shares the database with the other test classes, so each test sends messages with a unique
/// name and only asserts on those.
/// </summary>
[Collection(ApiCollection.Name)]
public class ContactEndpointTests(PortfolioApiFactory factory)
{
    private static readonly string LongMessage = string.Concat(Enumerable.Repeat("Hello from an integration test. ", 5));

    private async Task<HttpClient> SignedInClientAsync()
    {
        var client = factory.CreateBrowserClient();
        var response = await client.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}");
        response.EnsureSuccessStatusCode();
        return client;
    }

    private async Task<string> SendAsync(string? name = null)
    {
        name ??= $"Sender {Guid.NewGuid():N}";
        var response = await factory.CreateBrowserClient()
            .PostAsJsonAsync("/api/contact", new SendMessageRequest(name, "sender@example.com", LongMessage));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return name;
    }

    private static async Task<ContactMessageSummary> FindAsync(HttpClient admin, string name)
    {
        var page = await admin.GetFromJsonAsync<PagedResponse<ContactMessageSummary>>(
            $"/api/contact/messages?pageSize={ContactEndpoints.MaxPageSize}");
        return page!.Items.Single(m => m.Name == name);
    }

    [Fact]
    public async Task Anyone_can_send_a_message_and_the_admin_sees_it_unread()
    {
        var name = await SendAsync();
        var admin = await SignedInClientAsync();

        var summary = await FindAsync(admin, name);

        Assert.False(summary.IsRead);
        Assert.Equal(factory.Time.GetUtcNow(), summary.ReceivedAt, TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task A_project_enquiry_reaches_the_admin_as_one()
    {
        var name = $"Sender {Guid.NewGuid():N}";
        var response = await factory.CreateBrowserClient()
            .PostAsJsonAsync("/api/contact", new { name, email = "sender@example.com", message = LongMessage, topic = "project" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var admin = await SignedInClientAsync();

        var summary = await FindAsync(admin, name);
        var details = await admin.GetFromJsonAsync<ContactMessageDetails>($"/api/contact/messages/{summary.Id}");

        Assert.Equal("Project enquiry", summary.Subject);
        Assert.Equal("Project enquiry", details!.Subject);
    }

    [Fact]
    public async Task A_topic_it_doesnt_know_is_refused()
    {
        var response = await factory.CreateBrowserClient()
            .PostAsJsonAsync("/api/contact", new { name = "Ada", email = "sender@example.com", message = LongMessage, topic = "job" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(["topic"], (await response.Content.ReadFromJsonAsync<ValidationProblemDetails>())!.Errors.Keys);
    }

    [Fact]
    public async Task Invalid_messages_are_rejected_with_field_errors()
    {
        var response = await factory.CreateBrowserClient()
            .PostAsJsonAsync("/api/contact", new { name = "", email = "not-an-email", message = "short" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
        Assert.Equal(["email", "message", "name"], problem!.Errors.Keys.Order());
    }

    [Theory]
    [InlineData("GET", "/api/contact/messages")]
    [InlineData("GET", "/api/contact/messages/1")]
    [InlineData("POST", "/api/contact/messages/1/read")]
    [InlineData("DELETE", "/api/contact/messages/1")]
    public async Task The_inbox_is_admin_only(string method, string url)
    {
        var response = await factory.CreateBrowserClient().SendAsync(new HttpRequestMessage(new HttpMethod(method), url));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Opening_a_message_shows_its_details_and_marking_it_read_clears_the_unread_state()
    {
        var name = await SendAsync();
        var admin = await SignedInClientAsync();
        var summary = await FindAsync(admin, name);

        var details = await admin.GetFromJsonAsync<ContactMessageDetails>($"/api/contact/messages/{summary.Id}");
        Assert.Equal(name, details!.Name);
        Assert.Equal("sender@example.com", details.Email);
        Assert.Equal(LongMessage.Trim(), details.Message);
        Assert.Null(details.ReadAt);

        var read = await admin.PostAsync($"/api/contact/messages/{summary.Id}/read", null);

        Assert.Equal(HttpStatusCode.NoContent, read.StatusCode);
        Assert.True((await FindAsync(admin, name)).IsRead);
    }

    [Fact]
    public async Task The_inbox_is_paginated_newest_first()
    {
        string[] sent = [];
        for (var i = 0; i < 3; i++)
        {
            factory.Time.Advance(TimeSpan.FromSeconds(1)); // distinct, increasing received times
            sent = [.. sent, await SendAsync()];
        }
        var admin = await SignedInClientAsync();

        var page = await admin.GetFromJsonAsync<PagedResponse<ContactMessageSummary>>("/api/contact/messages?page=1&pageSize=2");

        Assert.Equal(2, page!.PageSize);
        Assert.True(page.TotalCount >= 3);
        Assert.Equal([sent[2], sent[1]], page.Items.Select(m => m.Name));
    }

    [Fact]
    public async Task Unknown_messages_return_404()
    {
        var admin = await SignedInClientAsync();

        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync("/api/contact/messages/999999")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PostAsync("/api/contact/messages/999999/read", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync("/api/contact/messages/999999")).StatusCode);
    }

    [Fact]
    public async Task The_admin_deletes_a_message()
    {
        var name = await SendAsync();
        var admin = await SignedInClientAsync();
        var summary = await FindAsync(admin, name);

        var deleted = await admin.DeleteAsync($"/api/contact/messages/{summary.Id}");

        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/contact/messages/{summary.Id}")).StatusCode);
    }

    /// <summary>Resend's webhook for an email to <paramref name="to"/>, signed as Resend signs it.</summary>
    private HttpRequestMessage Received(string emailId, string to = PortfolioApiFactory.SiteAddress, string? secret = null, string type = "email.received")
    {
        var body = $$$"""{"type":"{{{type}}}","created_at":"2026-10-22T10:00:00Z","data":{"email_id":"{{{emailId}}}","to":["{{{to}}}"],"cc":[]}}""";
        var id = $"msg_{Guid.NewGuid():N}";
        // The API's clock, which other tests move on.
        var timestamp = factory.Time.GetUtcNow().ToUnixTimeSeconds().ToString();
        var key = Convert.FromBase64String((secret ?? PortfolioApiFactory.InboundSecret)["whsec_".Length..]);
        var signature = Convert.ToBase64String(System.Security.Cryptography.HMACSHA256.HashData(key, System.Text.Encoding.UTF8.GetBytes($"{id}.{timestamp}.{body}")));
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/contact/inbound") { Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json") };
        request.Headers.Add("svix-id", id);
        request.Headers.Add("svix-timestamp", timestamp);
        request.Headers.Add("svix-signature", $"v1,{signature}");
        return request;
    }

    /// <summary>Someone emails the site: Resend keeps it and calls the webhook.</summary>
    private async Task<HttpResponseMessage> EmailTheSiteAsync(string from, string text, string? subject = null, string to = PortfolioApiFactory.SiteAddress)
    {
        var emailId = Guid.NewGuid().ToString();
        factory.Inbox.Emails[emailId] = new ReceivedEmail(from, subject, text, null, $"<{emailId}@mail.example.com>", "pass", false, 0);
        return await factory.CreateClient().SendAsync(Received(emailId, to));
    }

    [Fact]
    public async Task A_visitor_and_the_admin_keep_writing_to_each_other_by_email()
    {
        var name = $"Ada {Guid.NewGuid():N}"[..20];
        var address = $"ada-{Guid.NewGuid():N}@example.com";
        var visitor = factory.CreateBrowserClient();
        Assert.Equal(HttpStatusCode.Created, (await visitor.PostAsJsonAsync("/api/contact", new SendMessageRequest(name, address, new string('m', ContactRules.MessageMinLength)))).StatusCode);

        var admin = await SignedInClientAsync();
        var inbox = await admin.GetFromJsonAsync<PagedResponse<ContactMessageSummary>>("/api/contact/messages?pageSize=50");
        var id = Assert.Single(inbox!.Items, m => m.Name == name).Id;
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync($"/api/contact/messages/{id}/reply", new ReplyRequest("Thanks! When suits you?"))).StatusCode);

        // The answer goes from the site's address, which their reply goes back to: no link, no Reply-To.
        var email = Assert.Single(factory.Emails.To(address));
        Assert.Null(email.ReplyTo);
        Assert.DoesNotContain("http", email.Text);

        // They answer from their mail app, quoting the email as mail apps do.
        var answer = await EmailTheSiteAsync($"Ada <{address.ToUpperInvariant()}>", $"Tuesday at 10?\n\nOn Thu, 22 Oct 2026 at 10:00, Claudiu <{PortfolioApiFactory.SiteAddress}> wrote:\n> Thanks! When suits you?");
        Assert.Equal(HttpStatusCode.OK, answer.StatusCode);
        Assert.Contains(factory.Alerts.All, a => a.Title == $"New reply from {name}" && a.Message == "Tuesday at 10?");

        // In the admin's inbox: on top, unread again, in the same thread.
        inbox = await admin.GetFromJsonAsync<PagedResponse<ContactMessageSummary>>("/api/contact/messages?pageSize=50");
        Assert.Equal(name, inbox!.Items[0].Name);
        Assert.False(inbox.Items[0].IsRead);
        Assert.Equal(3, inbox.Items[0].Count);
        var details = await admin.GetFromJsonAsync<ContactMessageDetails>($"/api/contact/messages/{id}");
        Assert.Equal([("Thanks! When suits you?", false), ("Tuesday at 10?", true)], details!.Replies.Select(r => (r.Text, r.FromVisitor)));

        // The next answer quotes what they wrote last, in their email's thread.
        await admin.PostAsJsonAsync($"/api/contact/messages/{id}/reply", new ReplyRequest("Tuesday it is."));
        var second = factory.Emails.To(address).Last();
        Assert.Contains("> Tuesday at 10?", second.Text);
        Assert.EndsWith("@mail.example.com>", second.InReplyTo);
    }

    [Fact]
    public async Task An_email_from_someone_new_starts_a_conversation_with_its_subject()
    {
        var address = $"grace-{Guid.NewGuid():N}@example.com";

        Assert.Equal(HttpStatusCode.OK, (await EmailTheSiteAsync($"Grace Hopper <{address}>", "Hello there", "A question")).StatusCode);

        var admin = await SignedInClientAsync();
        var summary = (await admin.GetFromJsonAsync<PagedResponse<ContactMessageSummary>>("/api/contact/messages?pageSize=50"))!.Items.First(m => m.Name == "Grace Hopper");
        var details = await admin.GetFromJsonAsync<ContactMessageDetails>($"/api/contact/messages/{summary.Id}");
        Assert.Equal((address, "Hello there", "A question"), (details!.Email, details.Message, details.Subject));
        Assert.Contains(factory.Alerts.All, a => a.Title == "New email from Grace Hopper");

        await admin.PostAsJsonAsync($"/api/contact/messages/{summary.Id}/reply", new ReplyRequest("Hi Grace"));
        Assert.Equal("Re: A question", factory.Emails.To(address).Single().Subject);
    }

    [Fact]
    public async Task The_same_email_reported_twice_is_kept_once()
    {
        var address = $"twice-{Guid.NewGuid():N}@example.com";
        var emailId = Guid.NewGuid().ToString();
        factory.Inbox.Emails[emailId] = new ReceivedEmail(address, null, "Just once", null, null, "pass", false, 0);

        Assert.Equal(HttpStatusCode.OK, (await factory.CreateClient().SendAsync(Received(emailId))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await factory.CreateClient().SendAsync(Received(emailId))).StatusCode);

        var admin = await SignedInClientAsync();
        var items = (await admin.GetFromJsonAsync<PagedResponse<ContactMessageSummary>>("/api/contact/messages?pageSize=50"))!.Items.Where(m => m.Name == address).ToList();
        Assert.Equal(1, Assert.Single(items).Count);
    }

    [Fact]
    public async Task Emails_to_other_addresses_are_dropped()
    {
        var address = $"updates-reply-{Guid.NewGuid():N}@example.com";

        Assert.Equal(HttpStatusCode.OK, (await EmailTheSiteAsync(address, "Replying to an update", to: "updates@jechel.test")).StatusCode);

        var admin = await SignedInClientAsync();
        Assert.DoesNotContain((await admin.GetFromJsonAsync<PagedResponse<ContactMessageSummary>>("/api/contact/messages?pageSize=50"))!.Items, m => m.Name == address);
    }

    [Fact]
    public async Task A_forged_or_automatic_email_is_dropped()
    {
        var forged = $"forged-{Guid.NewGuid():N}@example.com";
        var away = $"away-{Guid.NewGuid():N}@example.com";
        var forgedId = Guid.NewGuid().ToString();
        var awayId = Guid.NewGuid().ToString();
        factory.Inbox.Emails[forgedId] = new ReceivedEmail(forged, null, "Pay this invoice", null, null, "fail", false, 0);
        factory.Inbox.Emails[awayId] = new ReceivedEmail(away, "Out of office", "I'm away", null, null, "pass", true, 0);

        Assert.Equal(HttpStatusCode.OK, (await factory.CreateClient().SendAsync(Received(forgedId))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await factory.CreateClient().SendAsync(Received(awayId))).StatusCode);

        var admin = await SignedInClientAsync();
        var names = (await admin.GetFromJsonAsync<PagedResponse<ContactMessageSummary>>("/api/contact/messages?pageSize=50"))!.Items.Select(m => m.Name).ToList();
        Assert.DoesNotContain(forged, names);
        Assert.DoesNotContain(away, names);
    }

    [Fact]
    public async Task Other_Resend_events_are_fine()
    {
        var sent = await factory.CreateClient().SendAsync(Received(Guid.NewGuid().ToString(), type: "email.delivered"));

        Assert.Equal(HttpStatusCode.OK, sent.StatusCode);
    }

    [Fact]
    public async Task A_webhook_not_signed_by_Resend_is_refused()
    {
        var emailId = Guid.NewGuid().ToString();
        factory.Inbox.Emails[emailId] = new ReceivedEmail("eve@example.com", null, "Fake", null, null, "pass", false, 0);

        var response = await factory.CreateClient().SendAsync(Received(emailId, secret: "whsec_" + Convert.ToBase64String("guess"u8.ToArray())));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task When_Resend_can_t_give_the_email_it_s_asked_to_try_again()
    {
        var response = await factory.CreateClient().SendAsync(Received(Guid.NewGuid().ToString()));

        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
    }
}
