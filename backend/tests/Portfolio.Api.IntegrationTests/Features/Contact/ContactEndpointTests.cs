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

    [Fact]
    public async Task A_visitor_and_the_admin_keep_writing_to_each_other_through_the_conversations_page()
    {
        var name = $"Ada {Guid.NewGuid():N}"[..20];
        var address = $"ada-{Guid.NewGuid():N}@example.com";
        var visitor = factory.CreateBrowserClient();
        Assert.Equal(HttpStatusCode.Created, (await visitor.PostAsJsonAsync("/api/contact", new SendMessageRequest(name, address, new string('m', ContactRules.MessageMinLength)))).StatusCode);

        var admin = await SignedInClientAsync();
        var inbox = await admin.GetFromJsonAsync<PagedResponse<ContactMessageSummary>>("/api/contact/messages?pageSize=50");
        var id = Assert.Single(inbox!.Items, m => m.Name == name).Id;
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync($"/api/contact/messages/{id}/reply", new ReplyRequest("Thanks! When suits you?"))).StatusCode);

        // The answer's email carries the conversation's link.
        var email = Assert.Single(factory.Emails.To(address));
        var token = System.Text.RegularExpressions.Regex.Match(email.Text, @"/contact/conversation\?token=([A-Za-z0-9_-]+)").Groups[1].Value;
        Assert.NotEmpty(token);

        var conversation = await visitor.GetFromJsonAsync<ConversationDto>($"/api/contact/conversations/{token}");
        Assert.Equal([true, false], conversation!.Messages.Select(m => m.FromVisitor));

        var written = await visitor.PostAsJsonAsync($"/api/contact/conversations/{token}/messages", new ReplyRequest("Tuesday at 10?"));
        Assert.Equal(HttpStatusCode.OK, written.StatusCode);
        Assert.Equal("Tuesday at 10?", (await written.Content.ReadFromJsonAsync<ConversationDto>())!.Messages[^1].Text);
        Assert.Contains(factory.Alerts.All, a => a.Title == $"New reply from {name}" && a.Message == "Tuesday at 10?");

        // In the admin's inbox: on top, unread again, in the same thread.
        inbox = await admin.GetFromJsonAsync<PagedResponse<ContactMessageSummary>>("/api/contact/messages?pageSize=50");
        Assert.Equal(name, inbox!.Items[0].Name);
        Assert.False(inbox.Items[0].IsRead);
        Assert.Equal(3, inbox.Items[0].Count);
        var details = await admin.GetFromJsonAsync<ContactMessageDetails>($"/api/contact/messages/{id}");
        Assert.Equal([("Thanks! When suits you?", false), ("Tuesday at 10?", true)], details!.Replies.Select(r => (r.Text, r.FromVisitor)));

        // The next answer quotes what they wrote last, with the same link.
        await admin.PostAsJsonAsync($"/api/contact/messages/{id}/reply", new ReplyRequest("Tuesday it is."));
        var second = factory.Emails.To(address).Last();
        Assert.Contains("> Tuesday at 10?", second.Text);
        Assert.Contains($"token={token}", second.Text);
    }

    [Theory]
    [InlineData("GET")]
    [InlineData("POST")]
    public async Task A_made_up_link_finds_no_conversation(string method)
    {
        var request = new HttpRequestMessage(new HttpMethod(method), method == "GET" ? "/api/contact/conversations/made-up" : "/api/contact/conversations/made-up/messages");
        if (method == "POST") request.Content = JsonContent.Create(new ReplyRequest("Hello?"));

        var response = await factory.CreateBrowserClient().SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task An_empty_reply_from_the_visitor_is_refused_with_a_field_error()
    {
        var visitor = factory.CreateBrowserClient();
        var address = $"bo-{Guid.NewGuid():N}@example.com";
        await visitor.PostAsJsonAsync("/api/contact", new SendMessageRequest("Bo", address, new string('m', ContactRules.MessageMinLength)));
        var admin = await SignedInClientAsync();
        var id = (await admin.GetFromJsonAsync<PagedResponse<ContactMessageSummary>>("/api/contact/messages?pageSize=50"))!.Items.First(m => m.Name == "Bo").Id;
        await admin.PostAsJsonAsync($"/api/contact/messages/{id}/reply", new ReplyRequest("Hi Bo"));
        var token = System.Text.RegularExpressions.Regex.Match(factory.Emails.To(address).Single().Text, @"token=([A-Za-z0-9_-]+)").Groups[1].Value;

        var response = await visitor.PostAsJsonAsync($"/api/contact/conversations/{token}/messages", new ReplyRequest("   "));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("\"text\"", await response.Content.ReadAsStringAsync());
    }
}
