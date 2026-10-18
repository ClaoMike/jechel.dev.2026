using System.Net;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using Portfolio.Api.Features.YouTube;

namespace Portfolio.Api.UnitTests.Features.YouTube;

public class YouTubeClientTests
{
    private static JsonNode Item(string id, string privacy = "public", string published = "2026-01-01T10:00:00Z", JsonObject? thumbnails = null) => new JsonObject
    {
        ["snippet"] = new JsonObject
        {
            ["title"] = $"Video {id}",
            ["description"] = $"About {id}",
            ["publishedAt"] = "2020-01-01T00:00:00Z",
            ["resourceId"] = new JsonObject { ["videoId"] = id },
            ["thumbnails"] = thumbnails ?? new JsonObject
            {
                ["medium"] = new JsonObject { ["url"] = $"https://i.ytimg.com/vi/{id}/mqdefault.jpg" },
                ["high"] = new JsonObject { ["url"] = $"https://i.ytimg.com/vi/{id}/hqdefault.jpg" },
            },
        },
        ["contentDetails"] = new JsonObject { ["videoPublishedAt"] = published },
        ["status"] = new JsonObject { ["privacyStatus"] = privacy },
    };

    private static JsonObject Page(string? next, params JsonNode[] items) => new()
    {
        ["items"] = new JsonArray(items),
        ["nextPageToken"] = next,
    };

    [Fact]
    public void Reads_public_videos_with_their_largest_thumbnail_and_publish_date()
    {
        var videos = YouTubeClient.ReadVideos(Page(null, Item("a"), Item("b", privacy: "private"), Item("c", thumbnails: []))).ToList();

        Assert.Equal(["a", "c"], videos.Select(v => v.Id));
        Assert.Equal(new YouTubeVideo("a", "Video a", "About a", "https://i.ytimg.com/vi/a/hqdefault.jpg", new DateTimeOffset(2026, 1, 1, 10, 0, 0, TimeSpan.Zero)), videos[0]);
        Assert.Equal("https://www.youtube.com/watch?v=a", videos[0].Url);
        Assert.Equal("https://i.ytimg.com/vi/c/hqdefault.jpg", videos[1].ThumbnailUrl);
    }

    [Fact]
    public void An_unknown_channel_throws()
    {
        Assert.Throws<InvalidDataException>(() => YouTubeClient.UploadsPlaylistId(new JsonObject { ["items"] = new JsonArray() }));
    }

    [Theory]
    [InlineData("@claudiu", "forHandle=%40claudiu")]
    [InlineData("UCabc", "id=UCabc")]
    public async Task Finds_the_uploads_of_a_handle_or_id_and_reads_every_page_newest_first(string channel, string channelQuery)
    {
        var requests = new List<string>();
        var handler = new FakeHandler(request =>
        {
            var url = request.RequestUri!.ToString();
            requests.Add(url);
            if (url.Contains("channels?")) return new JsonObject { ["items"] = new JsonArray(new JsonObject { ["contentDetails"] = new JsonObject { ["relatedPlaylists"] = new JsonObject { ["uploads"] = "UUabc" } } }) };
            return url.Contains("pageToken=p2")
                ? Page(null, Item("new", published: "2026-05-01T00:00:00Z"))
                : Page("p2", Item("old", published: "2025-05-01T00:00:00Z"));
        });
        var client = new YouTubeClient(new HttpClient(handler) { BaseAddress = YouTubeClient.BaseAddress }, TestOptions.Monitor(new YouTubeOptions { Channel = channel, ApiKey = "k" }));

        var videos = await client.FetchVideosAsync(default);

        Assert.Equal(["new", "old"], videos.Select(v => v.Id));
        Assert.Contains(channelQuery, requests[0]);
        Assert.All(requests, url => Assert.Contains("key=k", url));
        Assert.Contains("playlistId=UUabc", requests[1]);
        Assert.Equal(3, requests.Count);
    }

    private sealed class FakeHandler(Func<HttpRequestMessage, JsonNode> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(respond(request).ToJsonString()) });
    }
}
