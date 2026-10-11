using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;

namespace Portfolio.Api.Features.YouTube;

public static class YouTubeEndpoints
{
    public const int DefaultPageSize = 9;
    public const int MaxPageSize = 50;

    /// <summary>How long the list of videos is kept before asking YouTube again.</summary>
    public static readonly TimeSpan FreshFor = TimeSpan.FromHours(1);

    /// <summary>After YouTube fails, how long to keep showing the last list before trying again.</summary>
    public static readonly TimeSpan RetryAfter = TimeSpan.FromMinutes(5);

    public static IEndpointRouteBuilder MapYouTubeEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/youtube/videos", ListVideos).WithName("ListYouTubeVideos");
        return app;
    }

    /// <summary>
    /// Public. The channel's videos, newest first, a page at a time. 503 when YouTube isn't
    /// configured, or can't be reached and there's no earlier list to show.
    /// </summary>
    public static async Task<Results<Ok<PagedResponse<YouTubeVideo>>, ProblemHttpResult>> ListVideos(
        IOptions<YouTubeOptions> options,
        IYouTubeClient youTube,
        RefreshingCache<IReadOnlyList<YouTubeVideo>> cache,
        ILoggerFactory loggers,
        CancellationToken cancellationToken,
        int page = 1,
        int pageSize = DefaultPageSize)
    {
        if (!options.Value.IsConfigured)
        {
            return TypedResults.Problem("YouTube isn't set up: set YouTube:Channel and YouTube:ApiKey.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        IReadOnlyList<YouTubeVideo>? videos;
        try
        {
            videos = await cache.GetAsync(youTube.FetchVideosAsync, cancellationToken);
        }
        catch (Exception e) when (!cancellationToken.IsCancellationRequested)
        {
            loggers.CreateLogger(typeof(YouTubeEndpoints)).LogWarning(e, "Couldn't get the YouTube videos.");
            videos = null;
        }
        if (videos is null)
        {
            return TypedResults.Problem("YouTube can't be reached right now.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);
        var items = videos.Skip((page - 1) * pageSize).Take(pageSize).ToList();
        return TypedResults.Ok(new PagedResponse<YouTubeVideo>(items, page, pageSize, videos.Count));
    }
}
