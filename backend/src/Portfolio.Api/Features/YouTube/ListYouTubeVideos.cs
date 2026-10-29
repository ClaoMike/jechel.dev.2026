using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;
using Portfolio.Api.Common;
using static Portfolio.Api.Features.YouTube.YouTubeShared;

namespace Portfolio.Api.Features.YouTube;

/// <summary>
/// Public. The channel's videos, newest first, a page at a time (<see cref="YouTubeVideoStore"/>), which
/// visitors' browsers may keep for <see cref="BrowserCacheFor"/>; the signed-in admin's never keep them,
/// so a refresh shows at once. 503 when YouTube isn't configured, or there's no list yet and YouTube
/// can't be reached.
/// </summary>
public sealed class ListYouTubeVideos : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGet("/youtube/videos", Handle).WithName("ListYouTubeVideos");

    public static async Task<Results<Ok<PagedResponse<YouTubeVideo>>, ProblemHttpResult>> Handle(
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
}
