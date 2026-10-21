using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;

namespace Portfolio.Api.IntegrationTests.Features.Notifications;

[Collection(ApiCollection.Name)]
public class NotificationsEndpointTests(PortfolioApiFactory factory)
{
    private async Task<HttpClient> SignedInClientAsync()
    {
        var client = factory.CreateBrowserClient();
        var response = await client.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}");
        response.EnsureSuccessStatusCode();
        return client;
    }

    private async Task LogAsync(params PhoneAlertLog[] entries)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PortfolioDbContext>();
        db.PhoneAlertLogs.AddRange(entries);
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task The_admin_switches_a_kind_off_and_on_and_the_API_follows_at_once()
    {
        var admin = await SignedInClientAsync();
        var preferences = factory.Services.GetRequiredService<AlertPreferences>();

        try
        {
            var off = await admin.PutAsJsonAsync($"/api/notifications/kinds/{AlertKinds.UpdateSent}", new SaveNotificationKindRequest(false));
            Assert.Equal(HttpStatusCode.OK, off.StatusCode);
            Assert.False(Assert.Single((await off.Content.ReadFromJsonAsync<List<NotificationKindDto>>())!, k => k.Kind == AlertKinds.UpdateSent).Enabled);
            Assert.False(preferences.IsEnabled(AlertKinds.UpdateSent));
            var listed = (await admin.GetFromJsonAsync<List<NotificationKindDto>>("/api/notifications/kinds"))!;
            Assert.Equal(AlertKinds.All.Select(k => k.Key), listed.Select(k => k.Kind));
            Assert.False(listed.Single(k => k.Kind == AlertKinds.UpdateSent).Enabled);
        }
        finally
        {
            var on = await admin.PutAsJsonAsync($"/api/notifications/kinds/{AlertKinds.UpdateSent}", new SaveNotificationKindRequest(true));
            Assert.Equal(HttpStatusCode.OK, on.StatusCode);
        }
        Assert.True(preferences.IsEnabled(AlertKinds.UpdateSent));
    }

    [Fact]
    public async Task An_unknown_kind_is_not_found()
    {
        var response = await (await SignedInClientAsync()).PutAsJsonAsync("/api/notifications/kinds/nope", new SaveNotificationKindRequest(false));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task The_history_lists_what_was_raised_newest_first_and_of_one_kind()
    {
        var mark = Guid.NewGuid().ToString("N");
        var now = factory.Time.GetUtcNow();
        await LogAsync(
            new PhoneAlertLog { Kind = AlertKinds.SignIn, Title = $"older {mark}", Message = "Chrome on macOS", Path = "/settings", Status = AlertStatus.Sent, CreatedAt = now.AddMinutes(-5) },
            new PhoneAlertLog { Kind = AlertKinds.SignInRefused, Title = $"newer {mark}", Message = "x@example.com", Status = AlertStatus.Off, CreatedAt = now });
        var admin = await SignedInClientAsync();

        var all = (await admin.GetFromJsonAsync<PagedResponse<NotificationDto>>("/api/notifications?pageSize=50"))!;
        var signIns = (await admin.GetFromJsonAsync<PagedResponse<NotificationDto>>($"/api/notifications?kind={AlertKinds.SignIn}&pageSize=50"))!;

        Assert.Equal([$"newer {mark}", $"older {mark}"], all.Items.Where(n => n.Title.EndsWith(mark)).Select(n => n.Title));
        Assert.Equal(AlertStatus.Off, all.Items.Single(n => n.Title == $"newer {mark}").Status);
        Assert.All(signIns.Items, n => Assert.Equal(AlertKinds.SignIn, n.Kind));
        Assert.Contains(signIns.Items, n => n.Title == $"older {mark}" && n.Path == "/settings");
    }

    [Theory]
    [InlineData("GET", "/api/notifications")]
    [InlineData("GET", "/api/notifications/kinds")]
    [InlineData("PUT", "/api/notifications/kinds/message")]
    public async Task Visitors_cant_see_or_change_the_notifications(string method, string path)
    {
        var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (method == "PUT") request.Content = JsonContent.Create(new SaveNotificationKindRequest(false));

        var response = await factory.CreateBrowserClient().SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.True(factory.Services.GetRequiredService<AlertPreferences>().IsEnabled(AlertKinds.Message));
    }
}
