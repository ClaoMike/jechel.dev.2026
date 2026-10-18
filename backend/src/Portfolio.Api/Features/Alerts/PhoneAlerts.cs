using System.Collections.Concurrent;
using System.Threading.Channels;

namespace Portfolio.Api.Features.Alerts;

/// <summary>A push notification to the admin's phone.</summary>
/// <param name="Path">Where tapping it goes on the site, e.g. "/contact". Optional.</param>
/// <param name="Actions">Buttons on the notification. Optional.</param>
public record PhoneAlert(string Title, string Message, string? Path = null, AlertPriority Priority = AlertPriority.Default, string Tag = "", IReadOnlyList<AlertAction>? Actions = null);

/// <summary>A button on an alert: tapping it makes the phone POST to <paramref name="Url"/> (which must carry its own authorization, e.g. a token).</summary>
public record AlertAction(string Label, string Url);

/// <summary>ntfy's priorities: 1 (min) to 5 (max). High and above vibrate and pop up.</summary>
public enum AlertPriority
{
    Low = 2,
    Default = 3,
    High = 4,
}

/// <summary>
/// Tells the admin's phone about things worth knowing at once: a new message, a donation, a
/// crash. Never blocks and never throws: alerts are queued and sent by <see cref="AlertWorker"/>,
/// so a slow or broken notification service can't slow down or break the request that raised one.
/// </summary>
public interface IPhoneAlerts
{
    void Send(PhoneAlert alert);

    /// <summary>
    /// Sends it unless one with the same <paramref name="key"/> went out within <see cref="PhoneAlerts.ThrottleWindow"/>,
    /// or too many throttled alerts went out lately: a crash that hits every visitor rings once, not a thousand times.
    /// </summary>
    void SendThrottled(string key, PhoneAlert alert);
}

public class PhoneAlerts(TimeProvider time) : IPhoneAlerts
{
    public static readonly TimeSpan ThrottleWindow = TimeSpan.FromHours(1);

    /// <summary>At most this many throttled alerts (errors) per <see cref="ThrottleWindow"/>, whatever their keys.</summary>
    public const int MaxThrottledPerWindow = 10;

    // Dropping the oldest keeps memory bounded if the service is down for a long time.
    private readonly Channel<PhoneAlert> _queue = Channel.CreateBounded<PhoneAlert>(new BoundedChannelOptions(100) { FullMode = BoundedChannelFullMode.DropOldest });
    private readonly ConcurrentDictionary<string, DateTimeOffset> _lastSent = new();
    private readonly Queue<DateTimeOffset> _recentThrottled = new();
    private readonly Lock _lock = new();

    public ChannelReader<PhoneAlert> Reader => _queue.Reader;

    public void Send(PhoneAlert alert) => _queue.Writer.TryWrite(alert);

    public void SendThrottled(string key, PhoneAlert alert)
    {
        var now = time.GetUtcNow();
        lock (_lock)
        {
            if (_lastSent.TryGetValue(key, out var last) && now - last < ThrottleWindow) return;
            while (_recentThrottled.Count > 0 && now - _recentThrottled.Peek() >= ThrottleWindow) _recentThrottled.Dequeue();
            if (_recentThrottled.Count >= MaxThrottledPerWindow) return;

            _recentThrottled.Enqueue(now);
            _lastSent[key] = now;
            // Forget old keys, so a long-running server doesn't collect every error it ever saw.
            if (_lastSent.Count > 1000)
            {
                foreach (var (k, at) in _lastSent)
                {
                    if (now - at >= ThrottleWindow) _lastSent.TryRemove(k, out _);
                }
            }
        }
        Send(alert);
    }
}
