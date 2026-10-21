using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Portfolio.Api.Features.Updates;

namespace Portfolio.Api.IntegrationTests.Features.Updates;

[Collection(ApiCollection.Name)]
public partial class UpdatesEndpointTests(PortfolioApiFactory factory)
{
    private async Task<HttpClient> SignedInClientAsync()
    {
        var client = factory.CreateBrowserClient();
        var response = await client.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}");
        response.EnsureSuccessStatusCode();
        return client;
    }

    [Fact]
    public async Task A_visitor_subscribes_confirms_from_the_email_and_unsubscribes()
    {
        var visitor = factory.CreateBrowserClient();
        var address = $"reader-{Guid.NewGuid():N}@example.com";

        var subscribe = await visitor.PostAsJsonAsync("/api/updates/subscribe", new SubscribeRequest(address));
        Assert.Equal(HttpStatusCode.OK, subscribe.StatusCode);
        Assert.Equal(SubscribeStatus.Sent, (await subscribe.Content.ReadFromJsonAsync<SubscribeResult>())!.Status);

        var email = Assert.Single(factory.Emails.To(address));
        var token = ConfirmLink().Match(email.Text).Groups[1].Value;
        Assert.NotEmpty(token);

        var confirm = await visitor.PostAsync($"/api/updates/confirm?token={token}", null);
        Assert.Equal(HttpStatusCode.OK, confirm.StatusCode);
        var again = await visitor.PostAsJsonAsync("/api/updates/subscribe", new SubscribeRequest(address));
        Assert.Equal(SubscribeStatus.AlreadySubscribed, (await again.Content.ReadFromJsonAsync<SubscribeResult>())!.Status);
        Assert.Equal(address, (await confirm.Content.ReadFromJsonAsync<ConfirmedSubscription>())!.Email);

        var admin = await SignedInClientAsync();
        var list = await admin.GetFromJsonAsync<PagedResponse<SubscriberDto>>("/api/updates/subscribers?pageSize=50");
        Assert.NotNull(Assert.Single(list!.Items, s => s.Email == address).ConfirmedAt);

        // What a mail app's own Unsubscribe button sends (RFC 8058).
        var unsubscribe = await visitor.PostAsync($"/api/updates/unsubscribe?token={token}", new FormUrlEncodedContent([new("List-Unsubscribe", "One-Click")]));
        Assert.Equal(HttpStatusCode.NoContent, unsubscribe.StatusCode);
        list = await admin.GetFromJsonAsync<PagedResponse<SubscriberDto>>("/api/updates/subscribers?pageSize=50");
        Assert.DoesNotContain(list!.Items, s => s.Email == address);
    }

    [Fact]
    public async Task Unsubscribing_twice_at_once_is_fine()
    {
        var visitor = factory.CreateBrowserClient();
        var address = $"twice-{Guid.NewGuid():N}@example.com";
        await visitor.PostAsJsonAsync("/api/updates/subscribe", new SubscribeRequest(address));
        var token = ConfirmLink().Match(Assert.Single(factory.Emails.To(address)).Text).Groups[1].Value;

        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => visitor.PostAsync($"/api/updates/unsubscribe?token={token}", null)));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.NoContent, r.StatusCode));
    }

    [Fact]
    public async Task A_new_app_alerts_the_phone_whose_send_button_approves_it_with_its_token()
    {
        var admin = await SignedInClientAsync();
        var title = $"App {Guid.NewGuid():N}";
        var created = await admin.PostAsJsonAsync("/api/apps", new Portfolio.Api.Features.Apps.AppRequest(title, "About it", []));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        var alert = Assert.Single(factory.Alerts.All, a => a.Title == $"New app: {title}");
        var send = new Uri(alert.Actions![0].Url);
        Assert.Equal("jechel.test", send.Host);

        // The phone isn't signed in: the token in the link is what lets it through.
        var phone = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await phone.PostAsync(send.AbsolutePath + "?token=guess", null)).StatusCode);
        var approved = await phone.PostAsync(send.PathAndQuery, null);
        Assert.Equal(HttpStatusCode.OK, approved.StatusCode);
        Assert.Equal("approved", (await approved.Content.ReadFromJsonAsync<DecisionResult>())!.Status);

        var listed = await admin.GetFromJsonAsync<PagedResponse<AnnouncementDto>>("/api/updates/announcements?pageSize=50");
        Assert.Equal("approved", Assert.Single(listed!.Items, a => a.Title == title).Status);
    }

    [Fact]
    public async Task An_invalid_address_gets_a_field_error()
    {
        var response = await factory.CreateBrowserClient().PostAsJsonAsync("/api/updates/subscribe", new SubscribeRequest("nope"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("/api/updates/subscribers")]
    [InlineData("/api/updates/announcements")]
    public async Task Visitors_cant_see_who_subscribed_or_what_was_sent(string path)
    {
        var response = await factory.CreateBrowserClient().GetAsync(path);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task The_admin_rewords_the_emails_previews_and_tests_them_and_new_subscribers_get_the_new_words()
    {
        var admin = await SignedInClientAsync();
        var defaults = (await admin.GetFromJsonAsync<UpdateEmailsDocument>("/api/updates/emails"))!;
        Assert.Equal(UpdateEmailDefaults.Wording, defaults.Defaults);
        var mine = defaults.Defaults with { Confirm = defaults.Defaults.Confirm with { Subject = "One click to jechel.dev updates" } };

        try
        {
            var bad = await admin.PutAsJsonAsync("/api/updates/emails", mine with { Video = mine.Video with { Subject = "{name}" } });
            Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);

            var saved = await admin.PutAsJsonAsync("/api/updates/emails", mine);
            Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
            Assert.NotNull((await saved.Content.ReadFromJsonAsync<UpdateEmailsDocument>())!.UpdatedAt);

            var preview = await admin.PostAsJsonAsync("/api/updates/emails/preview", new UpdateEmailPreviewRequest(UpdateEmailKinds.App, mine));
            Assert.Equal(HttpStatusCode.OK, preview.StatusCode);
            Assert.Contains("jechel</span>", (await preview.Content.ReadFromJsonAsync<UpdateEmailPreview>())!.Html);

            var test = await admin.PostAsJsonAsync("/api/updates/emails/test", new UpdateEmailPreviewRequest(UpdateEmailKinds.Confirm, mine));
            Assert.True((await test.Content.ReadFromJsonAsync<Portfolio.Api.Features.Settings.TestResult>())!.Ok);
            Assert.Contains(factory.Emails.To(PortfolioApiFactory.AdminEmail), e => e.Subject == "[Test] One click to jechel.dev updates");

            var address = $"worded-{Guid.NewGuid():N}@example.com";
            await factory.CreateBrowserClient().PostAsJsonAsync("/api/updates/subscribe", new SubscribeRequest(address));
            var email = Assert.Single(factory.Emails.To(address));
            Assert.Equal("One click to jechel.dev updates", email.Subject);
            Assert.True(email.FromUpdates);
            Assert.Matches(ConfirmLink(), email.Text);
        }
        finally
        {
            var reset = await admin.DeleteAsync("/api/updates/emails");
            Assert.Equal(HttpStatusCode.OK, reset.StatusCode);
        }
        Assert.Null((await admin.GetFromJsonAsync<UpdateEmailsDocument>("/api/updates/emails"))!.UpdatedAt);
    }

    [Fact]
    public async Task A_subscribed_admin_unsubscribes_from_a_test_email_with_the_mail_apps_button_or_the_link()
    {
        var admin = await SignedInClientAsync();
        foreach (var how in new[] { "mail app", "link" })
        {
            await admin.PostAsJsonAsync("/api/updates/subscribe", new SubscribeRequest(PortfolioApiFactory.AdminEmail));
            var token = ConfirmLink().Match(factory.Emails.To(PortfolioApiFactory.AdminEmail).Last().Text).Groups[1].Value;
            await admin.PostAsync($"/api/updates/confirm?token={token}", null);

            var test = await admin.PostAsJsonAsync("/api/updates/emails/test", new UpdateEmailPreviewRequest(UpdateEmailKinds.Video, UpdateEmailDefaults.Wording));
            Assert.True((await test.Content.ReadFromJsonAsync<Portfolio.Api.Features.Settings.TestResult>())!.Ok);
            var email = factory.Emails.To(PortfolioApiFactory.AdminEmail).Last();
            Assert.Contains($"/updates/unsubscribe?token={token}", email.Text);

            // The mail app's button posts to the email's List-Unsubscribe address; the link opens the page, which calls the API.
            var unsubscribe = how == "mail app"
                ? await factory.CreateBrowserClient().PostAsync(new Uri(email.UnsubscribeUrl!).PathAndQuery, new FormUrlEncodedContent([new("List-Unsubscribe", "One-Click")]))
                : await factory.CreateBrowserClient().PostAsync($"/api/updates/unsubscribe?token={token}", null);
            Assert.Equal(HttpStatusCode.NoContent, unsubscribe.StatusCode);
            var list = await admin.GetFromJsonAsync<PagedResponse<SubscriberDto>>("/api/updates/subscribers?pageSize=50");
            Assert.DoesNotContain(list!.Items, s => s.Email == PortfolioApiFactory.AdminEmail);
        }
    }

    [Theory]
    [InlineData("GET", "/api/updates/emails")]
    [InlineData("PUT", "/api/updates/emails")]
    [InlineData("DELETE", "/api/updates/emails")]
    [InlineData("POST", "/api/updates/emails/preview")]
    [InlineData("POST", "/api/updates/emails/test")]
    public async Task Only_the_admin_sees_or_changes_the_emails_wording(string method, string path)
    {
        var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (method is "PUT" or "POST") request.Content = JsonContent.Create(new UpdateEmailPreviewRequest(UpdateEmailKinds.Confirm, UpdateEmailDefaults.Wording));

        var response = await factory.CreateBrowserClient().SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [GeneratedRegex(@"/updates/confirm\?token=([A-Za-z0-9_-]+)")]
    private static partial Regex ConfirmLink();
}
