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

    /// <summary>No ntfy topic yet (Settings → ntfy): only written to the log.</summary>
    public const string NotSetUp = "not-set-up";

    /// <summary>ntfy refused it or couldn't be reached.</summary>
    public const string Failed = "failed";
}

/// <summary>
/// The kinds of alert switched off, kept in memory so the alert worker never waits for the database to decide.
/// Loaded at start-up, and again after each change in the Notifications tab.
/// </summary>
public class AlertPreferences
{
    private volatile IReadOnlySet<string> _off = new HashSet<string>();

    public bool IsEnabled(string kind) => !_off.Contains(kind);

    public async Task ReloadAsync(PortfolioDbContext db, CancellationToken cancellationToken)
    {
        var off = await db.AlertPreferences.AsNoTracking().Where(p => !p.Enabled).Select(p => p.Kind).ToListAsync(cancellationToken);
        _off = off.ToHashSet();
    }
}
