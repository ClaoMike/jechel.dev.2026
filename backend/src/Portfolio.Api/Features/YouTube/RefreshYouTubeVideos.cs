using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;
using Portfolio.Api.Common;

namespace Portfolio.Api.Features.YouTube;

/// <summary>
/// Admin only. Asks YouTube for the videos now (e.g. right after uploading one) instead of waiting for
/// the hourly refresh, and keeps them. 503 when YouTube isn't configured or can't be reached (the
/// list kept so far stays), the latter with why (<c>cause</c>: <see cref="YouTubeVideoStore.LastError"/>).
/// </summary>
public sealed class RefreshYouTubeVideos : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapPost("/youtube/refresh", Handle).WithName("RefreshYouTubeVideos").RequireAuthorization();

    public static async Task<Results<Ok<RefreshResult>, ProblemHttpResult>> Handle(
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
