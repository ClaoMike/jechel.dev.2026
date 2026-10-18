using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Features.Alerts;

namespace Portfolio.Api.UnitTests.Features.Alerts;

public class PhoneAlertsTests
{
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 18, 12, 0, 0, TimeSpan.Zero));

    private static int Queued(PhoneAlerts alerts)
    {
        var count = 0;
        while (alerts.Reader.TryRead(out _)) count++;
        return count;
    }

    [Fact]
    public void Send_queues_every_alert()
    {
        var alerts = new PhoneAlerts(_time);

        alerts.Send(new PhoneAlert("One", "1"));
        alerts.Send(new PhoneAlert("Two", "2"));

        Assert.Equal(2, Queued(alerts));
    }

    [Fact]
    public void SendThrottled_sends_the_same_key_once_an_hour()
    {
        var alerts = new PhoneAlerts(_time);
        var alert = new PhoneAlert("Site error", "TypeError");

        alerts.SendThrottled("web:TypeError", alert);
        alerts.SendThrottled("web:TypeError", alert);
        alerts.SendThrottled("web:Other", alert);
        Assert.Equal(2, Queued(alerts));

        _time.Advance(PhoneAlerts.ThrottleWindow);
        alerts.SendThrottled("web:TypeError", alert);
        Assert.Equal(1, Queued(alerts));
    }

    [Fact]
    public void SendThrottled_caps_how_many_go_out_an_hour_whatever_the_keys()
    {
        var alerts = new PhoneAlerts(_time);

        for (var i = 0; i < PhoneAlerts.MaxThrottledPerWindow + 5; i++) alerts.SendThrottled($"key {i}", new PhoneAlert("Error", $"{i}"));

        Assert.Equal(PhoneAlerts.MaxThrottledPerWindow, Queued(alerts));
    }

    [Fact]
    public void NtfyMessage_links_to_the_site_and_cuts_long_text()
    {
        var body = AlertWorker.NtfyMessage(
            new PhoneAlert("New message", new string('m', 5000), "/contact", AlertPriority.High, "envelope"),
            "my-topic",
            new SiteOptions { PublicUrl = "https://jechel.dev/" });

        Assert.Equal("my-topic", body["topic"]);
        Assert.Equal(4, body["priority"]);
        Assert.Equal("https://jechel.dev/contact", body["click"]);
        Assert.Equal(new[] { "envelope" }, body["tags"]);
        Assert.Equal(1000, ((string)body["message"]).Length);
    }
}
