using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Apps;
using Portfolio.Api.Features.YouTube;

namespace Portfolio.Api.Features.Updates;

/// <summary>
/// Emails the confirmed subscribers. Run by <see cref="UpdatesWorker"/> every few minutes, and at once
/// when the admin approves an email. New YouTube videos are approved by themselves; a new app waits
/// for the admin (<see cref="AnnouncementDecisions"/>). An item is marked sending before the emails go
/// out (counting them as they go, so the Community tab shows its progress) and sent once they have, so a
/// crash halfway means some miss it, never that some get it twice.
/// </summary>
public class UpdatesAnnouncer(
    PortfolioDbContext db,
    IEmailSender emails,
    IOptions<SiteOptions> site,
    IOptionsMonitor<YouTubeOptions> youTubeOptions,
    YouTubeVideoStore videoStore,
    IPhoneAlerts alerts,
    TimeProvider time,
    ILogger<UpdatesAnnouncer> logger)
{
    public const string AppKind = "app";
    public const string VideoKind = "video";

    /// <summary>At most this many items per run, in case lots were posted at once; the rest go next time.</summary>
    public const int MaxItemsPerRun = 3;

    /// <summary>Between two emails, to stay under the email service's rate limit.</summary>
    public static TimeSpan DelayBetweenEmails { get; set; } = TimeSpan.FromMilliseconds(600);

    /// <summary>An address that isn't confirmed this long after it was given (and its last confirmation email) is deleted.</summary>
    public static readonly TimeSpan UnconfirmedKeptFor = TimeSpan.FromDays(7);

    /// <summary>Returns how many items were emailed.</summary>
    public async Task<int> AnnounceNewAsync(CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        await ForgetUnconfirmedAsync(now, cancellationToken);
        // What visitors can see (Settings → Visitor pages): only that is announced.
        var visible = await Site.SiteEndpoints.VisibleAsync(db, site.Value, cancellationToken);
        var state = await db.UpdatesStates.FindAsync([UpdatesState.SingletonId], cancellationToken);
        if (state is null)
        {
            // The first run only marks the start: videos already posted aren't news.
            db.UpdatesStates.Add(new UpdatesState { Id = UpdatesState.SingletonId, AnnounceAfter = now });
            await db.SaveChangesAsync(cancellationToken);
        }
        else
        {
            // While the YouTube page or the updates are off, new videos are seen but not news: switching
            // them on later doesn't email a backlog.
            await RecordNewVideosAsync(state.AnnounceAfter, now, visible.Pages["youtube"] && visible.Features["updates"], cancellationToken);
        }

        // Left sending by a run that stopped halfway (the app shut down): who got it is kept, the rest miss it.
        var interrupted = await db.Announcements.Where(a => a.Status == AnnouncementStatus.Sending).ToListAsync(cancellationToken);
        if (interrupted.Count > 0)
        {
            foreach (var announcement in interrupted) announcement.Status = AnnouncementStatus.Sent;
            await db.SaveChangesAsync(cancellationToken);
        }

        // Updates switched off: what's approved waits until they're back on.
        if (!visible.Features["updates"]) return 0;

        var approved = await db.Announcements
            .Where(a => a.Status == AnnouncementStatus.Approved)
            .OrderBy(a => a.CreatedAt)
            .ThenBy(a => a.Id)
            .Take(MaxItemsPerRun)
            .ToListAsync(cancellationToken);
        if (approved.Count == 0) return 0;

        var subscribers = await db.Subscribers.AsNoTracking()
            .Where(s => s.ConfirmedAt != null)
            .OrderBy(s => s.Id)
            .Select(s => new { s.Email, s.Token })
            .ToListAsync(cancellationToken);

        var wording = await UpdateEmailsEndpoints.LoadAsync(db, cancellationToken);
        var sent = 0;
        foreach (var announcement in approved)
        {
            var item = await ItemAsync(announcement, visible, cancellationToken);
            if (item is null)
            {
                // Deleted (the app) or gone from YouTube since, or its page is hidden from visitors.
                announcement.Status = AnnouncementStatus.Ignored;
                await db.SaveChangesAsync(cancellationToken);
                continue;
            }

            announcement.Status = AnnouncementStatus.Sending;
            announcement.SentAt = now;
            await db.SaveChangesAsync(cancellationToken);

            string? reason = null;
            try
            {
                foreach (var subscriber in subscribers)
                {
                    try
                    {
                        await emails.SendAsync(UpdateEmails.NewItem(subscriber.Email, announcement.Kind, item, subscriber.Token, wording, site.Value), cancellationToken);
                        announcement.RecipientCount++;
                        await db.SaveChangesAsync(cancellationToken);
                    }
                    catch (Exception e) when (!cancellationToken.IsCancellationRequested)
                    {
                        logger.LogWarning(e, "Couldn't email {Kind} {Key} to a subscriber.", announcement.Kind, announcement.ItemKey);
                        reason ??= e is Settings.ServiceException ? e.Message : "The email service couldn't be reached.";
                    }
                    if (DelayBetweenEmails > TimeSpan.Zero) await Task.Delay(DelayBetweenEmails, time, cancellationToken);
                }
            }
            finally
            {
                // Also when stopped halfway (the app shutting down): who got it is kept.
                await db.SaveChangesAsync(CancellationToken.None);
            }

            if (announcement.RecipientCount == 0 && subscribers.Count > 0)
            {
                // Not one email went out: the email service is down or refusing. Not lost: tried again next run.
                announcement.Status = AnnouncementStatus.Approved;
                announcement.SentAt = null;
                await db.SaveChangesAsync(CancellationToken.None);
                alerts.SendThrottled($"email:{reason}", new PhoneAlert(
                    AlertKinds.EmailFailing,
                    "Emails aren't going out",
                    $"\"{item.Title}\" couldn't be emailed to anyone; it's tried again in 10 minutes. {reason}",
                    "/settings",
                    AlertPriority.High,
                    "warning"));
                continue;
            }
            announcement.Status = AnnouncementStatus.Sent;
            await db.SaveChangesAsync(CancellationToken.None);
            sent++;

            alerts.Send(new PhoneAlert(
                AlertKinds.UpdateSent,
                $"Emailed: {item.Title}",
                $"The new {announcement.Kind} went to {announcement.RecipientCount} of {subscribers.Count} subscribers.",
                "/community",
                AlertPriority.Low,
                "mailbox_with_mail"));
        }
        return sent;
    }

    /// <summary>
    /// Deletes addresses never confirmed: given (and last sent a confirmation) more than <see cref="UnconfirmedKeptFor"/>
    /// ago. Someone may have typed another person's address: it isn't kept.
    /// </summary>
    private async Task ForgetUnconfirmedAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        var before = now - UnconfirmedKeptFor;
        var stale = await db.Subscribers.Where(s => s.ConfirmedAt == null && s.CreatedAt < before && s.ConfirmationSentAt < before).ToListAsync(cancellationToken);
        if (stale.Count == 0) return;
        db.Subscribers.RemoveRange(stale);
        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Videos published since announcing started, not seen before: approved, so they go out this run, or
    /// (<paramref name="announce"/> false) recorded as ignored, so they never go out.
    /// </summary>
    private async Task RecordNewVideosAsync(DateTimeOffset after, DateTimeOffset now, bool announce, CancellationToken cancellationToken)
    {
        var videos = await VideosAsync(cancellationToken);
        if (videos.Count == 0) return;

        var known = (await db.Announcements.AsNoTracking().Where(a => a.Kind == VideoKind).Select(a => a.ItemKey).ToListAsync(cancellationToken)).ToHashSet();
        foreach (var video in videos.Where(v => v.PublishedAt > after && !known.Contains(v.Id)).OrderBy(v => v.PublishedAt))
        {
            db.Announcements.Add(new Announcement
            {
                Kind = VideoKind,
                ItemKey = video.Id,
                Title = video.Title.Length <= 200 ? video.Title : video.Title[..200],
                Status = announce ? AnnouncementStatus.Approved : AnnouncementStatus.Ignored,
                CreatedAt = now,
            });
        }
        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>What the email shows, read now (an app may have been edited since); null when it's gone, or its page is hidden.</summary>
    private async Task<UpdateItem?> ItemAsync(Announcement announcement, Site.SiteStatus visible, CancellationToken cancellationToken)
    {
        if (announcement.Kind == AppKind)
        {
            if (!visible.Pages["apps"] || !int.TryParse(announcement.ItemKey, out var id)) return null;
            var app = await db.Apps.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id, cancellationToken);
            return app is null ? null : AppItem(app, site.Value);
        }

        if (!visible.Pages["youtube"]) return null;
        var video = (await VideosAsync(cancellationToken)).FirstOrDefault(v => v.Id == announcement.ItemKey);
        return video is null ? null : VideoItem(video);
    }

    /// <summary>An app as its email shows it: its first picture, and a button to the Apps page.</summary>
    public static UpdateItem AppItem(AppEntry app, SiteOptions site)
    {
        var media = JsonSerializer.Deserialize<AppMedia[]>(app.Media, JsonSerializerOptions.Web) ?? [];
        var image = media.FirstOrDefault(m => m.Kind == AppMediaKinds.Image)?.Url;
        // The Apps page: it always lists the app (What's new? may be hidden, or showing something newer by then).
        return new UpdateItem(app.Title, UpdateEmails.Summary(app.Description), site.UrlFor("/apps"), Absolute(image, site));
    }

    public static UpdateItem VideoItem(YouTubeVideo video) => new(video.Title, UpdateEmails.Summary(video.Description), video.Url, video.ThumbnailUrl);

    private async Task<IReadOnlyList<YouTubeVideo>> VideosAsync(CancellationToken cancellationToken)
    {
        if (!youTubeOptions.CurrentValue.IsConfigured) return [];
        return await videoStore.GetAsync(cancellationToken) ?? [];
    }

    private static string? Absolute(string? url, SiteOptions site) => url switch
    {
        null or "" => null,
        _ when url.StartsWith('/') => site.UrlFor(url),
        _ => url,
    };
}

/// <summary>Runs <see cref="UpdatesAnnouncer"/> every <see cref="Interval"/>, and at once when <see cref="UpdatesTrigger"/> is poked.</summary>
public class UpdatesWorker(IServiceScopeFactory scopes, UpdatesTrigger trigger, ILogger<UpdatesWorker> logger) : BackgroundService
{
    public static readonly TimeSpan Interval = TimeSpan.FromMinutes(10);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Let the app finish starting (and migrating) first.
        await trigger.WaitAsync(TimeSpan.FromSeconds(30), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<UpdatesAnnouncer>().AnnounceNewAsync(stoppingToken);
            }
            catch (Exception e) when (!stoppingToken.IsCancellationRequested)
            {
                logger.LogError(e, "Announcing new apps and videos failed.");
            }
            await trigger.WaitAsync(Interval, stoppingToken);
        }
    }
}
