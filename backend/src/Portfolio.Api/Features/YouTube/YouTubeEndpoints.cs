using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;

namespace Portfolio.Api.Features.YouTube;

public static class YouTubeEndpoints
{
    public const int DefaultPageSize = 9;
    public const int MaxPageSize = 50;

    /// <summary>How long browsers may reuse a page of videos before asking again (Cache-Control).</summary>
    public static readonly TimeSpan BrowserCacheFor = TimeSpan.FromMinutes(5);

    public static IEndpointRouteBuilder MapYouTubeEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/youtube/channel", GetChannel).WithName("GetYouTubeChannel");
        app.MapGet("/youtube/videos", ListVideos).WithName("ListYouTubeVideos");
        app.MapPost("/youtube/refresh", Refresh).WithName("RefreshYouTubeVideos").RequireAuthorization();
        return app;
    }

    /// <summary>
    /// Public. The channel's page on YouTube, for the site's links to it; 204 when no channel is set. Browsers may
    /// keep it for <see cref="BrowserCacheFor"/>.
    /// </summary>
    public static Results<Ok<YouTubeChannel>, NoContent> GetChannel(IOptionsMonitor<YouTubeOptions> options, HttpContext http)
    {
        http.Response.Headers.CacheControl = $"public, max-age={(int)BrowserCacheFor.TotalSeconds}";
        return options.CurrentValue.ChannelUrl is { } url ? TypedResults.Ok(new YouTubeChannel(url)) : TypedResults.NoContent();
    }

    /// <summary>
    /// Public. The channel's videos, newest first, a page at a time (<see cref="YouTubeVideoStore"/>), which
    /// visitors' browsers may keep for <see cref="BrowserCacheFor"/>; the signed-in admin's never keep them,
    /// so a refresh shows at once. 503 when YouTube isn't configured, or there's no list yet and YouTube
    /// can't be reached.
    /// </summary>
    public static async Task<Results<Ok<PagedResponse<YouTubeVideo>>, ProblemHttpResult>> ListVideos(
        IOptionsMonitor<YouTubeOptions> options,
        YouTubeVideoStore store,
        HttpContext http,
        CancellationToken cancellationToken,
        int page = 1,
        int pageSize = DefaultPageSize)
    {
        if (!options.CurrentValue.IsConfigured)
        {
            return TypedResults.Problem("YouTube isn't set up: set YouTube:Channel and YouTube:ApiKey.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var videos = await store.GetAsync(cancellationToken);
        if (videos is null)
        {
            return TypedResults.Problem("YouTube can't be reached right now.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);
        var items = videos.Skip((page - 1) * pageSize).Take(pageSize).ToList();
        // Per browser (private), and not across signing in (Vary: Cookie).
        http.Response.Headers.CacheControl = http.User.Identity?.IsAuthenticated == true
            ? "no-store"
            : $"private, max-age={(int)BrowserCacheFor.TotalSeconds}";
        http.Response.Headers.Vary = "Cookie";
        return TypedResults.Ok(new PagedResponse<YouTubeVideo>(items, page, pageSize, videos.Count));
    }

    /// <summary>
    /// Admin only. Asks YouTube for the videos now (e.g. right after uploading one) instead of waiting for
    /// the hourly refresh, and keeps them. 503 when YouTube isn't configured or can't be reached (the
    /// list kept so far stays), the latter with why (<c>cause</c>: <see cref="YouTubeVideoStore.LastError"/>).
    /// </summary>
    public static async Task<Results<Ok<RefreshResult>, ProblemHttpResult>> Refresh(
        IOptionsMonitor<YouTubeOptions> options,
        YouTubeVideoStore store,
        CancellationToken cancellationToken)
    {
        if (!options.CurrentValue.IsConfigured)
        {
            return TypedResults.Problem("YouTube isn't set up: set YouTube:Channel and YouTube:ApiKey.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var videos = await store.RefreshAsync(cancellationToken);
        return videos is null
            ? TypedResults.Problem(
                "YouTube can't be reached right now; the videos shown are the last ones saved.",
                statusCode: StatusCodes.Status503ServiceUnavailable,
                extensions: store.LastError is { } cause ? new Dictionary<string, object?> { ["cause"] = cause } : null)
            : TypedResults.Ok(new RefreshResult(videos.Count));
    }
}

/// <param name="Count">How many public videos the channel has now.</param>
public record RefreshResult(int Count);
