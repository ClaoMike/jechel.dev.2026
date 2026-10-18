using Portfolio.Api.Features.Alerts;

namespace Portfolio.Api.UnitTests.Features.Alerts;

/// <summary>Records alerts instead of sending them.</summary>
public sealed class FakePhoneAlerts : IPhoneAlerts
{
    public List<PhoneAlert> Sent { get; } = [];
    public List<(string Key, PhoneAlert Alert)> Throttled { get; } = [];

    public void Send(PhoneAlert alert) => Sent.Add(alert);

    public void SendThrottled(string key, PhoneAlert alert) => Throttled.Add((key, alert));
}
