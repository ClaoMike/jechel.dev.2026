using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Features.YouTube;

namespace Portfolio.Api.UnitTests.Features.YouTube;

public class YouTubeEndpointsTests
{
    private readonly FakeYouTubeClient _youTube = new() { Videos = [.. Enumerable.Range(1, 11).Select(n => FakeYouTubeClient.Video($"v{n}", 100 - n))] };
    private readonly YouTubeOptions _options = new() { Channel = "@me", ApiKey = "key" };
    private readonly DefaultHttpContext _http = new();

    private Task<Results<Ok<PagedResponse<YouTubeVideo>>, ProblemHttpResult>> List(int page = 1, int pageSize = YouTubeEndpoints.DefaultPageSize)
    {
        var store = new YouTubeVideoStore(new TestDatabase().Scopes, _youTube, TestOptions.Monitor(_options), new FakeTimeProvider(), NullLogger<YouTubeVideoStore>.Instance);
        return YouTubeEndpoints.ListVideos(TestOptions.Monitor(_options), store, _http.Response, CancellationToken.None, page, pageSize);
    }

    [Fact]
    public async Task Lists_the_first_nine_videos_newest_first_with_the_total()
    {
        var page = Assert.IsType<Ok<PagedResponse<YouTubeVideo>>>((await List()).Result).Value!;

        Assert.Equal(["v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8", "v9"], page.Items.Select(v => v.Id));
        Assert.Equal((1, 9, 11), (page.Page, page.PageSize, page.TotalCount));
    }

    [Fact]
    public async Task Lists_the_rest_on_the_next_page_and_nothing_past_the_end()
    {
        var second = Assert.IsType<Ok<PagedResponse<YouTubeVideo>>>((await List(page: 2)).Result).Value!;
        var past = Assert.IsType<Ok<PagedResponse<YouTubeVideo>>>((await List(page: 3)).Result).Value!;

        Assert.Equal(["v10", "v11"], second.Items.Select(v => v.Id));
        Assert.Empty(past.Items);
        Assert.Equal(11, past.TotalCount);
    }

    [Theory]
    [InlineData(0, 9, 1, 9)]
    [InlineData(-3, 9, 1, 9)]
    [InlineData(1, 0, 1, 1)]
    [InlineData(1, 500, 1, 50)]
    public async Task Keeps_the_page_and_its_size_within_bounds(int page, int pageSize, int expectedPage, int expectedSize)
    {
        var result = Assert.IsType<Ok<PagedResponse<YouTubeVideo>>>((await List(page, pageSize)).Result).Value!;

        Assert.Equal((expectedPage, expectedSize), (result.Page, result.PageSize));
    }

    [Fact]
    public async Task Lets_browsers_keep_the_list_for_five_minutes()
    {
        await List();

        Assert.Equal("public, max-age=300", _http.Response.Headers.CacheControl.ToString());
    }

    [Fact]
    public async Task Answers_503_until_YouTube_is_set_up_and_never_asks_it()
    {
        _options.Channel = "";

        var problem = Assert.IsType<ProblemHttpResult>((await List()).Result);

        Assert.Equal(503, problem.StatusCode);
        Assert.Equal("YouTube isn't set up: set YouTube:Channel and YouTube:ApiKey.", problem.ProblemDetails.Detail);
        Assert.Equal(0, _youTube.Calls);
        Assert.Empty(_http.Response.Headers.CacheControl.ToString());
    }

    [Fact]
    public async Task Answers_503_when_there_are_no_videos_yet_and_YouTube_cant_be_reached_and_isnt_kept()
    {
        _youTube.Fails = true;

        var problem = Assert.IsType<ProblemHttpResult>((await List()).Result);

        Assert.Equal(503, problem.StatusCode);
        Assert.Equal("YouTube can't be reached right now.", problem.ProblemDetails.Detail);
        Assert.Empty(_http.Response.Headers.CacheControl.ToString());
    }
}
