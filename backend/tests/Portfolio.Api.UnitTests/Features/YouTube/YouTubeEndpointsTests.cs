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

    private YouTubeVideoStore? _store;

    private YouTubeVideoStore Store => _store ??= new YouTubeVideoStore(new TestDatabase().Scopes, _youTube, TestOptions.Monitor(_options), new FakeTimeProvider(), NullLogger<YouTubeVideoStore>.Instance);

    private Task<Results<Ok<PagedResponse<YouTubeVideo>>, ProblemHttpResult>> List(int page = 1, int pageSize = YouTubeEndpoints.DefaultPageSize) =>
        YouTubeEndpoints.ListVideos(TestOptions.Monitor(_options), Store, _http, CancellationToken.None, page, pageSize);

    private Task<Results<Ok<RefreshResult>, ProblemHttpResult>> Refresh() =>
        YouTubeEndpoints.Refresh(TestOptions.Monitor(_options), Store, CancellationToken.None);

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
    public async Task Lets_a_visitors_browser_keep_the_list_for_five_minutes()
    {
        await List();

        Assert.Equal("private, max-age=300", _http.Response.Headers.CacheControl.ToString());
        Assert.Equal("Cookie", _http.Response.Headers.Vary.ToString());
    }

    [Fact]
    public async Task Never_lets_the_admins_browser_keep_it_so_a_refresh_shows_at_once()
    {
        _http.User = new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity([new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Email, "admin@example.com")], "Cookies"));

        await List();

        Assert.Equal("no-store", _http.Response.Headers.CacheControl.ToString());
    }

    [Fact]
    public async Task Refreshing_asks_YouTube_now_and_says_how_many_videos_there_are()
    {
        await List();
        _youTube.Videos = [FakeYouTubeClient.Video("new", 200), .. _youTube.Videos];

        var result = Assert.IsType<Ok<RefreshResult>>((await Refresh()).Result).Value!;

        Assert.Equal(12, result.Count);
        Assert.Equal(2, _youTube.Calls);
        Assert.Equal("new", Assert.IsType<Ok<PagedResponse<YouTubeVideo>>>((await List()).Result).Value!.Items[0].Id);
    }

    [Fact]
    public async Task Refreshing_answers_503_when_YouTube_cant_be_reached_and_keeps_the_list()
    {
        await List();
        _youTube.Fails = true;

        var problem = Assert.IsType<ProblemHttpResult>((await Refresh()).Result);

        Assert.Equal(503, problem.StatusCode);
        Assert.Equal("YouTube can't be reached right now; the videos shown are the last ones saved.", problem.ProblemDetails.Detail);
        // Why, to look into: the admin's refresh shows it, to copy.
        Assert.Equal("HttpRequestException: YouTube is down", problem.ProblemDetails.Extensions["cause"]);
        Assert.Equal(11, Assert.IsType<Ok<PagedResponse<YouTubeVideo>>>((await List()).Result).Value!.TotalCount);
    }

    [Fact]
    public async Task Refreshing_answers_503_until_YouTube_is_set_up_and_never_asks_it()
    {
        _options.ApiKey = " ";

        var problem = Assert.IsType<ProblemHttpResult>((await Refresh()).Result);

        Assert.Equal(503, problem.StatusCode);
        Assert.Equal(0, _youTube.Calls);
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

    [Theory]
    [InlineData("@me", "https://www.youtube.com/@me")]
    [InlineData("  @CiresariiStudio ", "https://www.youtube.com/@CiresariiStudio")]
    [InlineData("UCabc_123-XYZ", "https://www.youtube.com/channel/UCabc_123-XYZ")]
    public void Gives_the_channels_page_on_YouTube(string channel, string url)
    {
        _options.Channel = channel;

        var ok = Assert.IsType<Ok<YouTubeChannel>>(YouTubeEndpoints.GetChannel(TestOptions.Monitor(_options), _http).Result);

        Assert.Equal(url, ok.Value!.Url);
        Assert.Equal("public, max-age=300", _http.Response.Headers.CacheControl.ToString());
    }

    [Fact]
    public void Gives_the_channels_page_without_an_API_key_and_never_asks_YouTube()
    {
        _options.ApiKey = "";

        Assert.IsType<Ok<YouTubeChannel>>(YouTubeEndpoints.GetChannel(TestOptions.Monitor(_options), _http).Result);
        Assert.Equal(0, _youTube.Calls);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("@")]
    [InlineData("https://www.youtube.com/@me")]
    [InlineData("youtube.com/channel/UCabc")]
    [InlineData("UC")]
    [InlineData("UC abc")]
    public void Answers_204_when_no_channel_is_set_or_it_is_neither_a_handle_nor_an_id(string channel)
    {
        _options.Channel = channel;

        Assert.IsType<NoContent>(YouTubeEndpoints.GetChannel(TestOptions.Monitor(_options), _http).Result);
    }

    [Fact]
    public void Keeps_a_handle_in_the_address_even_with_odd_characters()
    {
        _options.Channel = "@a b/c";

        var ok = Assert.IsType<Ok<YouTubeChannel>>(YouTubeEndpoints.GetChannel(TestOptions.Monitor(_options), _http).Result);

        Assert.Equal("https://www.youtube.com/@a%20b%2Fc", ok.Value!.Url);
    }
}
