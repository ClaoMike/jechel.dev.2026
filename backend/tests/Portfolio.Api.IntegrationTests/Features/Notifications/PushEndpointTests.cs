using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;

namespace Portfolio.Api.IntegrationTests.Features.Notifications;

/// <summary>
/// The Notifications tab's ways alerts go and the devices that allowed the site's own notifications, through the real
/// pipeline and PostgreSQL. Nothing is posted to a push service here (no test button): the devices are made up.
/// Each test puts back the switches it changed and removes the devices it added.
/// </summary>
[Collection(ApiCollection.Name)]
public class PushEndpointTests(PortfolioApiFactory factory) : IAsyncLifetime
{
    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync()
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PortfolioDbContext>();
        await db.PushDevices.Where(d => d.Endpoint.StartsWith("https://push.test/")).ExecuteDeleteAsync();
        await db.AlertChannels.ExecuteDeleteAsync();
        await scope.ServiceProvider.GetRequiredService<AlertPreferences>().ReloadAsync(db, CancellationToken.None);
    }

    private async Task<HttpClient> AdminAsync()
    {
        var client = factory.CreateBrowserClient();
        (await client.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}")).EnsureSuccessStatusCode();
        return client;
    }

    private static object Device(string id, string label = "iPhone · Safari") =>
        new { endpoint = $"https://push.test/{id}", keys = new { p256dh = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth = "tBHItJI5svbpez7KI4CCXg" }, label };

    [Theory]
    [InlineData("GET", "/api/notifications/channels")]
    [InlineData("PUT", "/api/notifications/channels/push")]
    [InlineData("GET", "/api/notifications/push")]
    [InlineData("POST", "/api/notifications/push/devices")]
    [InlineData("DELETE", "/api/notifications/push/devices/1")]
    [InlineData("POST", "/api/notifications/push/devices/1/test")]
    public async Task Only_the_admin_can_use_them(string method, string url)
    {
        var response = await factory.CreateBrowserClient().SendAsync(new HttpRequestMessage(new HttpMethod(method), url) { Content = JsonContent.Create(new { }) });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Both_ways_start_on_and_one_switched_off_stays_off_for_the_next_alert()
    {
        var admin = await AdminAsync();
        var start = await admin.GetFromJsonAsync<List<AlertChannelDto>>("/api/notifications/channels");
        Assert.Equal([("ntfy", true), ("push", true)], start!.Select(c => (c.Channel, c.Enabled)));

        var off = await admin.PutAsJsonAsync("/api/notifications/channels/push", new { enabled = false });

        Assert.Equal(HttpStatusCode.OK, off.StatusCode);
        Assert.Equal([true, false], (await off.Content.ReadFromJsonAsync<List<AlertChannelDto>>())!.Select(c => c.Enabled));
        Assert.False(factory.Services.GetRequiredService<AlertPreferences>().IsChannelEnabled(AlertChannels.Push));
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PutAsJsonAsync("/api/notifications/channels/sms", new { enabled = true })).StatusCode);
    }

    [Fact]
    public async Task Gives_the_sites_key_the_same_every_time()
    {
        var admin = await AdminAsync();

        var first = await admin.GetFromJsonAsync<PushSetupDto>("/api/notifications/push");
        var again = await admin.GetFromJsonAsync<PushSetupDto>("/api/notifications/push");

        Assert.Equal(87, first!.PublicKey.Length);
        Assert.Equal(first.PublicKey, again!.PublicKey);
    }

    [Fact]
    public async Task A_device_that_allowed_notifications_is_listed_once_and_can_be_removed()
    {
        var admin = await AdminAsync();
        var id = Guid.NewGuid().ToString("N");

        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync("/api/notifications/push/devices", Device(id))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync("/api/notifications/push/devices", Device(id, "iPhone, again"))).StatusCode);

        var devices = (await admin.GetFromJsonAsync<PushSetupDto>("/api/notifications/push"))!.Devices.Where(d => d.Endpoint == $"https://push.test/{id}").ToList();
        var device = Assert.Single(devices);
        Assert.Equal("iPhone, again", device.Label);
        Assert.Contains((await admin.GetFromJsonAsync<List<AlertChannelDto>>("/api/notifications/channels"))!, c => c is { Channel: "push", Ready: true });

        Assert.Equal(HttpStatusCode.OK, (await admin.DeleteAsync($"/api/notifications/push/devices/{device.Id}")).StatusCode);
        Assert.DoesNotContain((await admin.GetFromJsonAsync<PushSetupDto>("/api/notifications/push"))!.Devices, d => d.Id == device.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"/api/notifications/push/devices/{device.Id}")).StatusCode);
    }

    [Fact]
    public async Task Refuses_a_push_address_that_isnt_https()
    {
        var admin = await AdminAsync();

        var response = await admin.PostAsJsonAsync("/api/notifications/push/devices", new { endpoint = "http://push.test/x", keys = new { p256dh = "a", auth = "b" }, label = "x" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(["endpoint"], (await response.Content.ReadFromJsonAsync<ValidationProblemDetails>())!.Errors.Keys);
    }
}
