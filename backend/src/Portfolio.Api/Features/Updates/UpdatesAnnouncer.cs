using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Apps;
using Portfolio.Api.Features.YouTube;

namespace Portfolio.Api.Features.Updates;

/// <summary>
/// Emails the confirmed subscribers about apps and videos posted since the last time. Run by
/// <see cref="UpdatesWorker"/> every few minutes. Each item is announced at most once: it's
/// recorded before the emails go out, so a crash halfway means some miss it, never that some get it twice.
/// </summary>
public class UpdatesAnnouncer(
    PortfolioDbContext db,
    IEmailSender emails,
    IOptions<SiteOptions> site,
    IOptions<YouTubeOptions> youTubeOptions,
    IYouTubeClient youTube,
    RefreshingCache<IReadOnlyList<YouTubeVideo>> videoCache,
    IPhoneAlerts alerts,
    TimeProvider time,
    ILogger<UpdatesAnnouncer> logger)
{
    public const string AppKind = "app";
    public const string VideoKind = "video";

    /// <summary>
    /// A new app is only announced once it's this old: time to finish its images and description,
    /// or to delete it, before anyone's emailed.
    /// </summary>
    public static readonly TimeSpan AppGracePeriod = TimeSpan.FromMinutes(30);

    /// <summary>At most this many items per run, in case lots were posted at once; the rest go next time.</summary>
    public const int MaxItemsPerRun = 3;

    /// <summary>Between two emails, to stay under the email service's rate limit.</summary>
    public static TimeSpan DelayBetweenEmails { get; set; } = TimeSpan.FromMilliseconds(600);

    private record Item(string Kind, string Key, string Title, string Summary, string Url, string? ImageUrl, DateTimeOffset PostedAt);

    /// <summary>Returns how many items were announced.</summary>
    public async Task<int> AnnounceNewAsync(CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        var state = await db.UpdatesStates.FindAsync([UpdatesState.SingletonId], cancellationToken);
        if (state is null)
        {
            // The first run only marks the start: what's already posted isn't news.
            db.UpdatesStates.Add(new UpdatesState { Id = UpdatesState.SingletonId, AnnounceAfter = now });
            await db.SaveChangesAsync(cancellationToken);
            return 0;
        }

        var announced = (await db.Announcements.AsNoTracking().Select(a => new { a.Kind, a.ItemKey }).ToListAsync(cancellationToken))
            .Select(a => (a.Kind, a.ItemKey))
            .ToHashSet();
        var items = (await NewAppsAsync(state.AnnounceAfter, now, cancellationToken))
            .Concat(await NewVideosAsync(state.AnnounceAfter, cancellationToken))
            .Where(i => !announced.Contains((i.Kind, i.Key)))
            .OrderBy(i => i.PostedAt)
            .Take(MaxItemsPerRun)
            .ToList();
        if (items.Count == 0) return 0;

        var subscribers = await db.Subscribers.AsNoTracking()
            .Where(s => s.ConfirmedAt != null)
            .OrderBy(s => s.Id)
            .Select(s => new { s.Email, s.Token })
            .ToListAsync(cancellationToken);

        foreach (var item in items)
        {
            var announcement = new Announcement { Kind = item.Kind, ItemKey = item.Key, Title = Cut(item.Title, 200), SentAt = now };
            db.Announcements.Add(announcement);
            await db.SaveChangesAsync(cancellationToken);

            foreach (var subscriber in subscribers)
            {
                var unsubscribe = site.Value.UrlFor($"/updates/unsubscribe?token={subscriber.Token}");
                try
                {
                    await emails.SendAsync(UpdateEmails.NewItem(subscriber.Email, item.Kind, item.Title, item.Summary, item.Url, item.ImageUrl, unsubscribe), cancellationToken);
                    announcement.RecipientCount++;
                }
                catch (Exception e) when (!cancellationToken.IsCancellationRequested)
                {
                    logger.LogWarning(e, "Couldn't email {Kind} {Key} to a subscriber.", item.Kind, item.Key);
                }
                if (DelayBetweenEmails > TimeSpan.Zero) await Task.Delay(DelayBetweenEmails, time, cancellationToken);
            }
            await db.SaveChangesAsync(CancellationToken.None);

            alerts.Send(new PhoneAlert(
                $"Emailed: {item.Title}",
                $"The new {item.Kind} went to {announcement.RecipientCount} of {subscribers.Count} subscribers.",
                "/community",
                AlertPriority.Low,
                "mailbox_with_mail"));
        }
        return items.Count;
    }

    private async Task<IEnumerable<Item>> NewAppsAsync(DateTimeOffset after, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var settledBefore = now - AppGracePeriod;
        var apps = await db.Apps.AsNoTracking()
            .Where(a => a.CreatedAt > after && a.CreatedAt <= settledBefore)
            .ToListAsync(cancellationToken);

        return apps.Select(a =>
        {
            var media = JsonSerializer.Deserialize<AppMedia[]>(a.Media, JsonSerializerOptions.Web) ?? [];
            var image = media.FirstOrDefault(m => m.Kind == AppMediaKinds.Image)?.Url;
            // "What's new?" shows the newest app in full.
            return new Item(AppKind, a.Id.ToString(), a.Title, UpdateEmails.Summary(a.Description), site.Value.UrlFor("/"), Absolute(image), a.CreatedAt);
        });
    }

    private async Task<IEnumerable<Item>> NewVideosAsync(DateTimeOffset after, CancellationToken cancellationToken)
    {
        if (!youTubeOptions.Value.IsConfigured) return [];
        try
        {
            var videos = await videoCache.GetAsync(youTube.FetchVideosAsync, cancellationToken);
            return videos
                .Where(v => v.PublishedAt > after)
                .Select(v => new Item(VideoKind, v.Id, v.Title, UpdateEmails.Summary(v.Description), v.Url, v.ThumbnailUrl, v.PublishedAt));
        }
        catch (Exception e) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(e, "Couldn't check YouTube for new videos.");
            return [];
        }
    }

    private string? Absolute(string? url) => url switch
    {
        null or "" => null,
        _ when url.StartsWith('/') => site.Value.UrlFor(url),
        _ => url,
    };

    private static string Cut(string text, int max) => text.Length <= max ? text : text[..max];
}

/// <summary>Runs <see cref="UpdatesAnnouncer"/> every <see cref="Interval"/>.</summary>
public class UpdatesWorker(IServiceScopeFactory scopes, TimeProvider time, ILogger<UpdatesWorker> logger) : BackgroundService
{
    public static readonly TimeSpan Interval = TimeSpan.FromMinutes(10);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Let the app finish starting (and migrating) first.
        await Task.Delay(TimeSpan.FromMinutes(1), time, stoppingToken);
        using var timer = new PeriodicTimer(Interval, time);
        do
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
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
