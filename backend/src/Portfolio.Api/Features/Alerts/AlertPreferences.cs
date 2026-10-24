using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Alerts;

/// <summary>What happened to an alert, as its history shows.</summary>
public static class AlertStatus
{
    /// <summary>On the phone.</summary>
    public const string Sent = "sent";

    /// <summary>Its kind is switched off in the Notifications tab.</summary>
    public const string Off = "off";

    /// <summary>No way that's on could send it yet (no ntfy topic in Settings → ntfy, no device for the site's own notifications): only written to the log.</summary>
    public const string NotSetUp = "not-set-up";

    /// <summary>Every way it could go failed (ntfy refused it or couldn't be reached; no device took it).</summary>
    public const string Failed = "failed";

    /// <summary>Both ways alerts go are switched off in the Notifications tab.</summary>
    public const string NoChannel = "no-channel";
}

/// <summary>The ways alerts go, each switched on or off in the Notifications tab (both on to start with).</summary>
public static class AlertChannels
{
    /// <summary>The ntfy app (Settings → ntfy).</summary>
    public const string Ntfy = "ntfy";

    /// <summary>The site's own notifications (Web Push): the devices that allowed them.</summary>
    public const string Push = "push";

    public static readonly IReadOnlyList<string> All = [Ntfy, Push];
}

/// <summary>
/// The kinds of alert switched off, and the ways alerts go that are, kept in memory so the alert worker never waits for
/// the database to decide. Loaded at start-up, and again after each change in the Notifications tab.
/// </summary>
public class AlertPreferences
{
    private volatile IReadOnlySet<string> _off = new HashSet<string>();
    private volatile IReadOnlySet<string> _channelsOff = new HashSet<string>();

    public bool IsEnabled(string kind) => !_off.Contains(kind);

    public bool IsChannelEnabled(string channel) => !_channelsOff.Contains(channel);

    public async Task ReloadAsync(PortfolioDbContext db, CancellationToken cancellationToken)
    {
        var off = await db.AlertPreferences.AsNoTracking().Where(p => !p.Enabled).Select(p => p.Kind).ToListAsync(cancellationToken);
        var channelsOff = await db.AlertChannels.AsNoTracking().Where(c => !c.Enabled).Select(c => c.Channel).ToListAsync(cancellationToken);
        _off = off.ToHashSet();
        _channelsOff = channelsOff.ToHashSet();
    }
}
