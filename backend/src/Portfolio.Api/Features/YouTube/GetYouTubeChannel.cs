using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;
using Portfolio.Api.Common;
using static Portfolio.Api.Features.YouTube.YouTubeShared;

namespace Portfolio.Api.Features.YouTube;

/// <summary>
/// Public. The channel's page on YouTube, for the site's links to it; 204 when no channel is set. Browsers may
/// keep it for <see cref="BrowserCacheFor"/>.
/// </summary>
public sealed class GetYouTubeChannel : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGet("/youtube/channel", Handle).WithName("GetYouTubeChannel");

    public static Results<Ok<YouTubeChannel>, NoContent> Handle(IOptionsMonitor<YouTubeOptions> options, HttpContext http)
    {
        http.Response.Headers.CacheControl = $"public, max-age={(int)BrowserCacheFor.TotalSeconds}";
        return options.CurrentValue.ChannelUrl is { } url ? TypedResults.Ok(new YouTubeChannel(url)) : TypedResults.NoContent();
    }
}
