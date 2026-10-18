using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Features.YouTube;

namespace Portfolio.Api.UnitTests.Features.YouTube;

public class YouTubeEndpointsTests
{
    private static readonly IOptionsMonitor<YouTubeOptions> Configured = TestOptions.Monitor(new YouTubeOptions { Channel = "@me", ApiKey = "k" });
    private readonly RefreshingCache<IReadOnlyList<YouTubeVideo>> _cache = new(new FakeTimeProvider(), YouTubeEndpoints.FreshFor, YouTubeEndpoints.RetryAfter);

    private static YouTubeVideo Video(int n) => new($"v{n}", $"Video {n}", "", "", default);

    private sealed class FakeYouTube(int count, bool fails = false) : IYouTubeClient
    {
        public Task<IReadOnlyList<YouTubeVideo>> FetchVideosAsync(CancellationToken cancellationToken) =>
            fails ? throw new HttpRequestException("down") : Task.FromResult<IReadOnlyList<YouTubeVideo>>([.. Enumerable.Range(1, count).Select(Video)]);
    }

    [Fact]
    public async Task Returns_a_page_of_nine_by_default()
    {
        var result = await YouTubeEndpoints.ListVideos(Configured, new FakeYouTube(12), _cache, NullLoggerFactory.Instance, default, page: 2);

        var page = Assert.IsType<Ok<PagedResponse<YouTubeVideo>>>(result.Result).Value!;
        Assert.Equal((2, 9, 12), (page.Page, page.PageSize, page.TotalCount));
        Assert.Equal(["v10", "v11", "v12"], page.Items.Select(v => v.Id));
    }

    [Fact]
    public async Task Is_unavailable_until_configured_or_when_youtube_fails_with_nothing_kept()
    {
        var notSetUp = await YouTubeEndpoints.ListVideos(TestOptions.Monitor(new YouTubeOptions()), new FakeYouTube(1), _cache, NullLoggerFactory.Instance, default);
        var down = await YouTubeEndpoints.ListVideos(Configured, new FakeYouTube(1, fails: true), _cache, NullLoggerFactory.Instance, default);

        Assert.Equal(503, Assert.IsType<ProblemHttpResult>(notSetUp.Result).StatusCode);
        Assert.Equal(503, Assert.IsType<ProblemHttpResult>(down.Result).StatusCode);
    }
}
