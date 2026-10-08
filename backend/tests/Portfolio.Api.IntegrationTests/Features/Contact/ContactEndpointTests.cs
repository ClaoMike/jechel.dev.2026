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
    }
}
