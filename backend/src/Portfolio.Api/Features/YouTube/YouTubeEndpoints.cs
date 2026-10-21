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
        app.MapGet("/youtube/videos", ListVideos).WithName("ListYouTubeVideos");
        return app;
    }

    /// <summary>
    /// Public. The channel's videos, newest first, a page at a time (<see cref="YouTubeVideoStore"/>), which
    /// browsers may keep for <see cref="BrowserCacheFor"/>. 503 when YouTube isn't configured, or there's no
    /// list yet and YouTube can't be reached.
    /// </summary>
    public static async Task<Results<Ok<PagedResponse<YouTubeVideo>>, ProblemHttpResult>> ListVideos(
        IOptionsMonitor<YouTubeOptions> options,
        YouTubeVideoStore store,
        HttpResponse response,
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
        response.Headers.CacheControl = $"public, max-age={(int)BrowserCacheFor.TotalSeconds}";
        return TypedResults.Ok(new PagedResponse<YouTubeVideo>(items, page, pageSize, videos.Count));
    }
}
