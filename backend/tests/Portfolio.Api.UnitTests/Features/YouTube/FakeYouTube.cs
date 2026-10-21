using System.Net;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Portfolio.Api.Data;
using Portfolio.Api.Features.YouTube;

namespace Portfolio.Api.UnitTests.Features.YouTube;

/// <summary>Answers like YouTube's Data API: one handler per path, every request recorded.</summary>
public sealed class FakeYouTubeApi : HttpMessageHandler
{
    private readonly Dictionary<string, Func<HttpRequestMessage, HttpResponseMessage>> _routes = [];

    public List<Uri> Requests { get; } = [];

    /// <summary>Answers requests to <paramref name="path"/> ("channels", "playlistItems").</summary>
    public FakeYouTubeApi On(string path, Func<HttpRequestMessage, HttpResponseMessage> answer)
    {
        _routes[path] = answer;
        return this;
    }

    public static HttpResponseMessage Json(JsonNode body, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(body.ToJsonString(), System.Text.Encoding.UTF8, "application/json") };

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Requests.Add(request.RequestUri!);
        var path = request.RequestUri!.AbsolutePath.Split('/').Last();
        return Task.FromResult(_routes.TryGetValue(path, out var answer) ? answer(request) : new HttpResponseMessage(HttpStatusCode.NotFound));
    }

    public YouTubeClient Client(string channel = "@me", string key = "the-key") =>
        new(new HttpClient(this) { BaseAddress = YouTubeClient.BaseAddress }, TestOptions.Monitor(new YouTubeOptions { Channel = channel, ApiKey = key }));

    /// <summary>A channels.list answer whose uploads playlist is <paramref name="uploads"/>.</summary>
    public static JsonNode Channel(string uploads = "UU123") =>
        new JsonObject { ["items"] = new JsonArray(new JsonObject { ["contentDetails"] = new JsonObject { ["relatedPlaylists"] = new JsonObject { ["uploads"] = uploads } } }) };

    /// <summary>A playlistItems.list item.</summary>
    public static JsonObject Item(string id, string published, string privacy = "public", JsonObject? thumbnails = null, string? title = null, string? description = null, bool withVideoPublishedAt = true)
    {
        var snippet = new JsonObject
        {
            ["title"] = title ?? $"Video {id}",
            ["description"] = description ?? $"About {id}",
            ["publishedAt"] = "2020-01-01T00:00:00Z",
            ["resourceId"] = new JsonObject { ["videoId"] = id },
            ["thumbnails"] = thumbnails ?? new JsonObject { ["high"] = new JsonObject { ["url"] = $"https://i.ytimg.com/vi/{id}/hqdefault.jpg" } },
        };
        var details = new JsonObject();
        if (withVideoPublishedAt) details["videoPublishedAt"] = published;
        return new JsonObject { ["snippet"] = snippet, ["contentDetails"] = details, ["status"] = new JsonObject { ["privacyStatus"] = privacy } };
    }

    /// <summary>A playlistItems.list page.</summary>
    public static JsonNode Page(string? nextPageToken, params JsonObject[] items)
    {
        var page = new JsonObject { ["items"] = new JsonArray([.. items]) };
        if (nextPageToken is not null) page["nextPageToken"] = nextPageToken;
        return page;
    }
}

/// <summary>Stands in for <see cref="IYouTubeClient"/>: returns <see cref="Videos"/>, or fails.</summary>
public sealed class FakeYouTubeClient : IYouTubeClient
{
    public IReadOnlyList<YouTubeVideo> Videos { get; set; } = [Video("a", 2), Video("b", 1)];
    public bool Fails { get; set; }
    public int Calls { get; private set; }

    /// <summary>Holds every fetch until set, to have requests arrive while one is under way.</summary>
    public TaskCompletionSource? Gate { get; set; }

    public static YouTubeVideo Video(string id, int day) =>
        new(id, $"Video {id}", $"About {id}", $"https://i.ytimg.com/vi/{id}/hqdefault.jpg", DateTimeOffset.UnixEpoch.AddDays(day));

    public async Task<IReadOnlyList<YouTubeVideo>> FetchVideosAsync(CancellationToken cancellationToken)
    {
        Calls++;
        if (Gate is not null) await Gate.Task.WaitAsync(cancellationToken);
        if (Fails) throw new HttpRequestException("YouTube is down");
        return Videos;
    }
}

/// <summary>A database in memory, shared by every scope of <see cref="Scopes"/> (as the API's is).</summary>
public sealed class TestDatabase
{
    private readonly ServiceProvider _services;

    public TestDatabase()
    {
        var name = Guid.NewGuid().ToString();
        _services = new ServiceCollection().AddDbContext<PortfolioDbContext>(o => o.UseInMemoryDatabase(name)).BuildServiceProvider();
    }

    public IServiceScopeFactory Scopes => _services.GetRequiredService<IServiceScopeFactory>();

    public PortfolioDbContext Open() => _services.CreateScope().ServiceProvider.GetRequiredService<PortfolioDbContext>();
}
