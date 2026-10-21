using System.Net;
using System.Text.Json.Nodes;
using Portfolio.Api.Features.YouTube;
using static Portfolio.Api.UnitTests.Features.YouTube.FakeYouTubeApi;

namespace Portfolio.Api.UnitTests.Features.YouTube;

public class YouTubeClientTests
{
    [Fact]
    public async Task Finds_a_handles_uploads_playlist_then_reads_it()
    {
        var api = new FakeYouTubeApi()
            .On("channels", _ => Json(Channel("UU123")))
            .On("playlistItems", _ => Json(Page(null, Item("a", "2024-05-01T10:00:00Z"))));

        var videos = await api.Client(channel: "@me", key: "the-key").FetchVideosAsync(CancellationToken.None);

        Assert.Equal(["a"], videos.Select(v => v.Id));
        Assert.Equal("/youtube/v3/channels?part=contentDetails&forHandle=%40me&key=the-key", api.Requests[0].PathAndQuery);
        Assert.Equal("/youtube/v3/playlistItems?part=snippet,contentDetails,status&maxResults=50&playlistId=UU123&key=the-key", api.Requests[1].PathAndQuery);
    }

    [Fact]
    public async Task Looks_a_channel_id_up_by_id_and_trims_the_settings()
    {
        var api = new FakeYouTubeApi()
            .On("channels", _ => Json(Channel()))
            .On("playlistItems", _ => Json(Page(null)));

        await api.Client(channel: "  UCabc ", key: " k&y ").FetchVideosAsync(CancellationToken.None);

        Assert.Equal("/youtube/v3/channels?part=contentDetails&id=UCabc&key=k%26y", api.Requests[0].PathAndQuery);
    }

    [Fact]
    public async Task Reads_every_page_and_returns_the_videos_newest_first()
    {
        var api = new FakeYouTubeApi()
            .On("channels", _ => Json(Channel()))
            .On("playlistItems", request => request.RequestUri!.Query.Contains("pageToken=next%2B1")
                ? Json(Page(null, Item("newest", "2024-06-01T00:00:00Z")))
                : Json(Page("next+1", Item("old", "2023-01-01T00:00:00Z"), Item("middle", "2024-01-01T00:00:00Z"))));

        var videos = await api.Client().FetchVideosAsync(CancellationToken.None);

        Assert.Equal(["newest", "middle", "old"], videos.Select(v => v.Id));
        Assert.Equal(3, api.Requests.Count);
    }

    [Fact]
    public async Task Stops_paging_once_it_has_the_most_it_keeps()
    {
        var page = 0;
        var api = new FakeYouTubeApi()
            .On("channels", _ => Json(Channel()))
            .On("playlistItems", _ =>
            {
                page++;
                var items = Enumerable.Range(0, 50).Select(i => Item($"p{page}-{i}", "2024-01-01T00:00:00Z")).ToArray();
                return Json(Page("more", items));
            });

        var videos = await api.Client().FetchVideosAsync(CancellationToken.None);

        Assert.Equal(YouTubeClient.MaxVideos, videos.Count);
        Assert.Equal(YouTubeClient.MaxVideos / 50, page);
    }

    [Theory]
    [InlineData("channels")]
    [InlineData("playlistItems")]
    public async Task Throws_when_YouTube_refuses(string failing)
    {
        var api = new FakeYouTubeApi()
            .On("channels", _ => failing == "channels" ? new HttpResponseMessage(HttpStatusCode.Forbidden) : Json(Channel()))
            .On("playlistItems", _ => new HttpResponseMessage(HttpStatusCode.Forbidden));

        await Assert.ThrowsAsync<HttpRequestException>(() => api.Client().FetchVideosAsync(CancellationToken.None));
    }

    [Fact]
    public async Task Throws_when_the_channel_doesnt_exist()
    {
        var api = new FakeYouTubeApi().On("channels", _ => Json(new JsonObject { ["items"] = new JsonArray() }));

        var error = await Assert.ThrowsAsync<InvalidDataException>(() => api.Client().FetchVideosAsync(CancellationToken.None));
        Assert.Equal("YouTube has no such channel.", error.Message);
    }

    [Fact]
    public async Task Throws_when_YouTube_answers_with_nothing()
    {
        var api = new FakeYouTubeApi().On("channels", _ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("null") });

        await Assert.ThrowsAsync<InvalidDataException>(() => api.Client().FetchVideosAsync(CancellationToken.None));
    }

    [Fact]
    public void Reads_a_videos_fields()
    {
        var video = Assert.Single(ReadVideos(Item("abc", "2024-05-01T10:00:00Z", title: "Title", description: "Line 1\nLine 2")));

        Assert.Equal(new YouTubeVideo("abc", "Title", "Line 1\nLine 2", "https://i.ytimg.com/vi/abc/hqdefault.jpg", new DateTimeOffset(2024, 5, 1, 10, 0, 0, TimeSpan.Zero)), video);
    }

    [Theory]
    [InlineData("private")]
    [InlineData("unlisted")]
    [InlineData("privacyStatusUnspecified")]
    public void Leaves_out_videos_that_arent_public(string privacy) =>
        Assert.Empty(ReadVideos(Item("a", "2024-01-01T00:00:00Z", privacy: privacy)));

    [Fact]
    public void Leaves_out_items_without_a_video()
    {
        var noVideoId = Item("a", "2024-01-01T00:00:00Z");
        noVideoId["snippet"]!["resourceId"] = new JsonObject();
        var noSnippet = Item("b", "2024-01-01T00:00:00Z");
        noSnippet.Remove("snippet");

        Assert.Empty(ReadVideos(noVideoId, noSnippet));
    }

    [Fact]
    public void Picks_the_largest_thumbnail_there_is()
    {
        var thumbnails = new JsonObject
        {
            ["default"] = new JsonObject { ["url"] = "small" },
            ["standard"] = new JsonObject { ["url"] = "standard" },
            ["maxres"] = new JsonObject { ["url"] = "largest" },
        };
        var withoutMaxres = new JsonObject { ["default"] = new JsonObject { ["url"] = "small" }, ["medium"] = new JsonObject { ["url"] = "medium" } };

        Assert.Equal("largest", ReadVideos(Item("a", "2024-01-01T00:00:00Z", thumbnails: thumbnails)).Single().ThumbnailUrl);
        Assert.Equal("medium", ReadVideos(Item("a", "2024-01-01T00:00:00Z", thumbnails: withoutMaxres)).Single().ThumbnailUrl);
    }

    [Fact]
    public void Falls_back_to_YouTubes_usual_thumbnail_when_none_is_listed()
    {
        var video = ReadVideos(Item("xyz", "2024-01-01T00:00:00Z", thumbnails: new JsonObject())).Single();

        Assert.Equal("https://i.ytimg.com/vi/xyz/hqdefault.jpg", video.ThumbnailUrl);
    }

    [Fact]
    public void Dates_a_video_by_when_it_was_published_else_when_it_was_added_to_the_playlist()
    {
        var published = ReadVideos(Item("a", "2024-05-01T10:00:00Z")).Single();
        var added = ReadVideos(Item("b", "2024-05-01T10:00:00Z", withVideoPublishedAt: false)).Single();

        Assert.Equal(new DateTimeOffset(2024, 5, 1, 10, 0, 0, TimeSpan.Zero), published.PublishedAt);
        Assert.Equal(new DateTimeOffset(2020, 1, 1, 0, 0, 0, TimeSpan.Zero), added.PublishedAt);
    }

    [Fact]
    public void Reads_a_video_without_a_title_description_or_dates_with_empty_ones()
    {
        var item = Item("bare", "2024-01-01T00:00:00Z", withVideoPublishedAt: false);
        var snippet = item["snippet"]!.AsObject();
        snippet.Remove("title");
        snippet.Remove("description");
        snippet.Remove("publishedAt");

        var video = ReadVideos(item).Single();

        Assert.Equal(("", "", default(DateTimeOffset)), (video.Title, video.Description, video.PublishedAt));
    }

    [Fact]
    public void Reads_a_page_without_items_as_no_videos() =>
        Assert.Empty(YouTubeClient.ReadVideos(new JsonObject()));

    [Fact]
    public void Video_links_to_its_page_on_YouTube() =>
        Assert.Equal("https://www.youtube.com/watch?v=abc", FakeYouTubeClient.Video("abc", 1).Url);

    [Theory]
    [InlineData("@me", "key", true)]
    [InlineData("", "key", false)]
    [InlineData("@me", "", false)]
    [InlineData("  ", "  ", false)]
    public void YouTube_is_set_up_once_both_the_channel_and_the_key_are(string channel, string key, bool configured) =>
        Assert.Equal(configured, new YouTubeOptions { Channel = channel, ApiKey = key }.IsConfigured);

    private static IEnumerable<YouTubeVideo> ReadVideos(params JsonObject[] items) =>
        YouTubeClient.ReadVideos(Page(null, items));
}
