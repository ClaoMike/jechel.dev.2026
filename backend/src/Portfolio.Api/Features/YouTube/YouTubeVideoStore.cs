using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.YouTube;

/// <summary>
/// The channel's videos, for everything that shows them (the YouTube page, What's new, email updates).
/// Kept in memory and in the database (<see cref="YouTubeSnapshot"/>), so a restart or a YouTube outage
/// still has the last list. <see cref="YouTubeRefreshWorker"/> asks YouTube again every <see cref="FreshFor"/>;
/// a visitor only waits for YouTube when there's no list at all yet. Register it as a singleton.
/// </summary>
public class YouTubeVideoStore(
    IServiceScopeFactory scopes,
    IYouTubeClient youTube,
    IOptionsMonitor<YouTubeOptions> options,
    TimeProvider time,
    ILogger<YouTubeVideoStore> logger)
{
    /// <summary>How often the list is fetched again.</summary>
    public static readonly TimeSpan FreshFor = TimeSpan.FromHours(1);

    /// <summary>After YouTube fails, how long until it's asked again.</summary>
    public static readonly TimeSpan RetryAfter = TimeSpan.FromMinutes(5);

    private sealed record Kept(string Channel, IReadOnlyList<YouTubeVideo> Videos);

    // One fetch or database read at a time: requests arriving together cause one.
    private readonly SemaphoreSlim _lock = new(1, 1);
    private Kept? _kept;

    /// <summary>
    /// Why the last fetch from YouTube failed ("HttpRequestException: … 403 (Forbidden)."), with any API key blanked;
    /// null once one succeeds. For the admin's refresh, to look into.
    /// </summary>
    public string? LastError { get; private set; }

    private string Channel => options.CurrentValue.Channel.Trim().ToLowerInvariant();

    /// <summary>
    /// The videos, newest first: from memory, else the database, else YouTube. Null when there's no list
    /// and YouTube can't be reached.
    /// </summary>
    public async Task<IReadOnlyList<YouTubeVideo>?> GetAsync(CancellationToken cancellationToken)
    {
        var channel = Channel;
        if (_kept is { } kept && kept.Channel == channel) return kept.Videos;

        await _lock.WaitAsync(cancellationToken);
        try
        {
            // Another request may have loaded it while this one waited.
            if (_kept is { } loaded && loaded.Channel == channel) return loaded.Videos;
            return (await LoadAsync(channel, cancellationToken) ?? await FetchAsync(channel, cancellationToken))?.Videos;
        }
        finally
        {
            _lock.Release();
        }
    }

    /// <summary>Asks YouTube for the list again: the new list, or null when YouTube failed (the list kept so far stays).</summary>
    public async Task<IReadOnlyList<YouTubeVideo>?> RefreshAsync(CancellationToken cancellationToken)
    {
        await _lock.WaitAsync(cancellationToken);
        try
        {
            return (await FetchAsync(Channel, cancellationToken))?.Videos;
        }
        finally
        {
            _lock.Release();
        }
    }

    /// <summary>An exception as "Type: message", any "key=…" in it (a request's address) blanked.</summary>
    public static string Describe(Exception e) => Regex.Replace($"{e.GetType().Name}: {e.Message}", @"key=[^&\s]+", "key=…");

    /// <summary>Forgets the list in memory (the channel or key changed): the next <see cref="GetAsync"/> reads it again.</summary>
    public void Clear() => _kept = null;

    private async Task<Kept?> LoadAsync(string channel, CancellationToken cancellationToken)
    {
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<PortfolioDbContext>();
            var row = await db.YouTubeSnapshots.AsNoTracking().FirstOrDefaultAsync(s => s.Channel == channel, cancellationToken);
            if (row is null) return null;
            var videos = JsonSerializer.Deserialize<List<YouTubeVideo>>(row.Videos, JsonSerializerOptions.Web) ?? [];
            return _kept = new Kept(channel, videos);
        }
        catch (Exception e) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(e, "Couldn't read the saved YouTube videos.");
            return null;
        }
    }

    private async Task<Kept?> FetchAsync(string channel, CancellationToken cancellationToken)
    {
        IReadOnlyList<YouTubeVideo> videos;
        try
        {
            videos = await youTube.FetchVideosAsync(cancellationToken);
        }
        catch (Exception e) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(e, "Couldn't get the YouTube videos.");
            LastError = Describe(e);
            return null;
        }

        LastError = null;
        _kept = new Kept(channel, videos);
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<PortfolioDbContext>();
            var row = await db.YouTubeSnapshots.FindAsync([channel], cancellationToken);
            if (row is null)
            {
                row = new YouTubeSnapshot { Channel = channel, Videos = "" };
                db.YouTubeSnapshots.Add(row);
            }
            row.Videos = JsonSerializer.Serialize(videos, JsonSerializerOptions.Web);
            row.FetchedAt = time.GetUtcNow();
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception e) when (!cancellationToken.IsCancellationRequested)
        {
            // Still shown from memory; saved on the next refresh.
            logger.LogWarning(e, "Couldn't save the YouTube videos.");
        }
        return _kept;
    }
}

/// <summary>
/// Refreshes <see cref="YouTubeVideoStore"/> as the API starts, then every <see cref="YouTubeVideoStore.FreshFor"/>
/// (after a failure, every <see cref="YouTubeVideoStore.RetryAfter"/>), so visitors never wait for YouTube.
/// </summary>
public class YouTubeRefreshWorker(YouTubeVideoStore store, IOptionsMonitor<YouTubeOptions> options, TimeProvider time) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var next = YouTubeVideoStore.FreshFor;
            if (options.CurrentValue.IsConfigured && await store.RefreshAsync(stoppingToken) is null) next = YouTubeVideoStore.RetryAfter;
            await Task.Delay(next, time, stoppingToken);
        }
    }
}
