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
/// for the admin (<see cref="AnnouncementDecisions"/>). An item is marked sent before the emails go
/// out, so a crash halfway means some miss it, never that some get it twice.
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

    private record Item(string Title, string Summary, string Url, string? ImageUrl);

    /// <summary>Returns how many items were emailed.</summary>
    public async Task<int> AnnounceNewAsync(CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        var state = await db.UpdatesStates.FindAsync([UpdatesState.SingletonId], cancellationToken);
        if (state is null)
        {
            // The first run only marks the start: videos already posted aren't news.
            db.UpdatesStates.Add(new UpdatesState { Id = UpdatesState.SingletonId, AnnounceAfter = now });
            await db.SaveChangesAsync(cancellationToken);
        }
        else
        {
            await ApproveNewVideosAsync(state.AnnounceAfter, now, cancellationToken);
        }

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

        var sent = 0;
        foreach (var announcement in approved)
        {
            var item = await ItemAsync(announcement, cancellationToken);
            if (item is null)
            {
                // Deleted (the app) or gone from YouTube since.
                announcement.Status = AnnouncementStatus.Ignored;
                await db.SaveChangesAsync(cancellationToken);
                continue;
            }

            announcement.Status = AnnouncementStatus.Sent;
            announcement.SentAt = now;
            await db.SaveChangesAsync(cancellationToken);

            foreach (var subscriber in subscribers)
            {
                var unsubscribe = site.Value.UrlFor($"/updates/unsubscribe?token={subscriber.Token}");
                try
                {
                    await emails.SendAsync(UpdateEmails.NewItem(subscriber.Email, announcement.Kind, item.Title, item.Summary, item.Url, item.ImageUrl, unsubscribe), cancellationToken);
                    announcement.RecipientCount++;
                }
                catch (Exception e) when (!cancellationToken.IsCancellationRequested)
                {
                    logger.LogWarning(e, "Couldn't email {Kind} {Key} to a subscriber.", announcement.Kind, announcement.ItemKey);
                }
                if (DelayBetweenEmails > TimeSpan.Zero) await Task.Delay(DelayBetweenEmails, time, cancellationToken);
            }
            await db.SaveChangesAsync(CancellationToken.None);
            sent++;

            alerts.Send(new PhoneAlert(
                $"Emailed: {item.Title}",
                $"The new {announcement.Kind} went to {announcement.RecipientCount} of {subscribers.Count} subscribers.",
                "/community",
                AlertPriority.Low,
                "mailbox_with_mail"));
        }
        return sent;
    }

    /// <summary>Videos published since announcing started, not seen before: approved, so they go out this run.</summary>
    private async Task ApproveNewVideosAsync(DateTimeOffset after, DateTimeOffset now, CancellationToken cancellationToken)
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
                Status = AnnouncementStatus.Approved,
                CreatedAt = now,
            });
        }
        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>What the email shows, read now (an app may have been edited since); null when it's gone.</summary>
    private async Task<Item?> ItemAsync(Announcement announcement, CancellationToken cancellationToken)
    {
        if (announcement.Kind == AppKind)
        {
            if (!int.TryParse(announcement.ItemKey, out var id)) return null;
            var app = await db.Apps.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id, cancellationToken);
            if (app is null) return null;

            var media = JsonSerializer.Deserialize<AppMedia[]>(app.Media, JsonSerializerOptions.Web) ?? [];
            var image = media.FirstOrDefault(m => m.Kind == AppMediaKinds.Image)?.Url;
            // "What's new?" shows the newest app in full.
            return new Item(app.Title, UpdateEmails.Summary(app.Description), site.Value.UrlFor("/"), Absolute(image));
        }

        var video = (await VideosAsync(cancellationToken)).FirstOrDefault(v => v.Id == announcement.ItemKey);
        return video is null ? null : new Item(video.Title, UpdateEmails.Summary(video.Description), video.Url, video.ThumbnailUrl);
    }

    private async Task<IReadOnlyList<YouTubeVideo>> VideosAsync(CancellationToken cancellationToken)
    {
        if (!youTubeOptions.CurrentValue.IsConfigured) return [];
        return await videoStore.GetAsync(cancellationToken) ?? [];
    }

    private string? Absolute(string? url) => url switch
    {
        null or "" => null,
        _ when url.StartsWith('/') => site.Value.UrlFor(url),
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
