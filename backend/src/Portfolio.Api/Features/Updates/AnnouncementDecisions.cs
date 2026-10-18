using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;

namespace Portfolio.Api.Features.Updates;

public static class AnnouncementStatus
{
    /// <summary>A new app: waiting for the admin to send or ignore it.</summary>
    public const string Pending = "pending";

    /// <summary>To be emailed by the next run of <see cref="UpdatesAnnouncer"/> (started at once).</summary>
    public const string Approved = "approved";

    public const string Sent = "sent";
    public const string Ignored = "ignored";
}

/// <summary>Wakes <see cref="UpdatesWorker"/> up, e.g. right after the admin approved an email.</summary>
public class UpdatesTrigger
{
    private readonly SemaphoreSlim _signal = new(0);

    public void Poke()
    {
        if (_signal.CurrentCount == 0) _signal.Release();
    }

    /// <summary>True when poked, false when <paramref name="timeout"/> passed first.</summary>
    public Task<bool> WaitAsync(TimeSpan timeout, CancellationToken cancellationToken) => _signal.WaitAsync(timeout, cancellationToken);
}

/// <summary>Asking the admin whether to email the subscribers about a new app, and their answer.</summary>
public static class AnnouncementDecisions
{
    /// <summary>
    /// Records the new app as pending and alerts the phone, with "Send email" and "Ignore" buttons.
    /// The buttons' links carry a one-time token, since the phone isn't signed in.
    /// </summary>
    public static async Task ProposeAppAsync(AppEntry app, PortfolioDbContext db, IPhoneAlerts alerts, SiteOptions site, TimeProvider time, CancellationToken cancellationToken)
    {
        var token = UpdatesEndpoints.NewToken();
        var announcement = new Announcement
        {
            Kind = UpdatesAnnouncer.AppKind,
            ItemKey = app.Id.ToString(),
            Title = app.Title.Length <= 200 ? app.Title : app.Title[..200],
            Status = AnnouncementStatus.Pending,
            DecisionTokenHash = Hash(token),
            CreatedAt = time.GetUtcNow(),
        };
        db.Announcements.Add(announcement);
        await db.SaveChangesAsync(cancellationToken);

        var subscribers = await db.Subscribers.CountAsync(s => s.ConfirmedAt != null, cancellationToken);
        var url = (string action) => site.UrlFor($"/api/updates/announcements/{announcement.Id}/{action}?token={token}");
        alerts.Send(new PhoneAlert(
            $"New app: {app.Title}",
            $"Email it to your {subscribers} {(subscribers == 1 ? "subscriber" : "subscribers")}? You can also decide later in the Community tab.",
            "/community",
            AlertPriority.Default,
            "rocket",
            [new AlertAction("Send email", url("send")), new AlertAction("Ignore", url("ignore"))]));
    }

    /// <summary>True when <paramref name="token"/> is the one in the announcement's alert.</summary>
    public static bool TokenMatches(Announcement announcement, string? token) =>
        announcement.DecisionTokenHash is { } hash && !string.IsNullOrEmpty(token) &&
        CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(hash), Encoding.ASCII.GetBytes(Hash(token)));

    public static string Hash(string token) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
