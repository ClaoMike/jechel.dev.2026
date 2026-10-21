using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.YouTube;
using static Portfolio.Api.UnitTests.Features.YouTube.FakeYouTubeClient;

namespace Portfolio.Api.UnitTests.Features.YouTube;

public class YouTubeVideoStoreTests
{
    private readonly TestDatabase _db = new();
    private readonly FakeYouTubeClient _youTube = new();
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 21, 12, 0, 0, TimeSpan.Zero));
    private readonly YouTubeOptions _options = new() { Channel = "@Me", ApiKey = "key" };

    /// <summary>A store, as the API has after starting: a new one is a restart (nothing in memory).</summary>
    private YouTubeVideoStore Store(IYouTubeClient? youTube = null) =>
        new(_db.Scopes, youTube ?? _youTube, TestOptions.Monitor(_options), _time, NullLogger<YouTubeVideoStore>.Instance);

    private void Save(string channel, params YouTubeVideo[] videos)
    {
        using var db = _db.Open();
        db.YouTubeSnapshots.Add(new YouTubeSnapshot { Channel = channel, Videos = JsonSerializer.Serialize(videos, JsonSerializerOptions.Web), FetchedAt = _time.GetUtcNow() });
        db.SaveChanges();
    }

    private YouTubeSnapshot? Saved(string channel = "@me")
    {
        using var db = _db.Open();
        return db.YouTubeSnapshots.Find(channel);
    }

    [Fact]
    public async Task The_first_time_asks_YouTube_and_saves_the_list()
    {
        var videos = await Store().GetAsync(CancellationToken.None);

        Assert.Equal(["a", "b"], videos!.Select(v => v.Id));
        Assert.Equal(1, _youTube.Calls);
        var saved = Saved();
        Assert.NotNull(saved);
        Assert.Equal(_time.GetUtcNow(), saved.FetchedAt);
        Assert.Equal(_youTube.Videos, JsonSerializer.Deserialize<List<YouTubeVideo>>(saved.Videos, JsonSerializerOptions.Web));
    }

    [Fact]
    public async Task Then_answers_from_memory_without_asking_YouTube_again()
    {
        var store = Store();
        await store.GetAsync(CancellationToken.None);
        _time.Advance(TimeSpan.FromDays(1));

        await store.GetAsync(CancellationToken.None);
        await store.GetAsync(CancellationToken.None);

        Assert.Equal(1, _youTube.Calls);
    }

    [Fact]
    public async Task After_a_restart_answers_from_the_database_without_asking_YouTube()
    {
        Save("@me", Video("saved", 5));

        var videos = await Store().GetAsync(CancellationToken.None);

        Assert.Equal(["saved"], videos!.Select(v => v.Id));
        Assert.Equal(0, _youTube.Calls);
    }

    [Fact]
    public async Task While_YouTube_is_down_still_shows_the_saved_list()
    {
        Save("@me", Video("saved", 5));
        _youTube.Fails = true;

        var store = Store();

        Assert.Equal(["saved"], (await store.GetAsync(CancellationToken.None))!.Select(v => v.Id));
        Assert.False(await store.RefreshAsync(CancellationToken.None));
        Assert.Equal(["saved"], (await store.GetAsync(CancellationToken.None))!.Select(v => v.Id));
    }

    [Fact]
    public async Task With_no_list_at_all_and_YouTube_down_has_nothing_to_show()
    {
        _youTube.Fails = true;

        Assert.Null(await Store().GetAsync(CancellationToken.None));
        Assert.Null(Saved());
    }

    [Fact]
    public async Task Tries_YouTube_again_on_the_next_request_after_it_failed()
    {
        _youTube.Fails = true;
        var store = Store();
        await store.GetAsync(CancellationToken.None);

        _youTube.Fails = false;

        Assert.Equal(["a", "b"], (await store.GetAsync(CancellationToken.None))!.Select(v => v.Id));
    }

    [Fact]
    public async Task Refreshing_replaces_the_list_in_memory_and_in_the_database()
    {
        var store = Store();
        await store.GetAsync(CancellationToken.None);
        _youTube.Videos = [Video("new", 3), Video("a", 2), Video("b", 1)];
        _time.Advance(TimeSpan.FromHours(1));

        Assert.True(await store.RefreshAsync(CancellationToken.None));

        Assert.Equal(["new", "a", "b"], (await store.GetAsync(CancellationToken.None))!.Select(v => v.Id));
        Assert.Equal(["new", "a", "b"], (await Store().GetAsync(CancellationToken.None))!.Select(v => v.Id));
        Assert.Equal(_time.GetUtcNow(), Saved()!.FetchedAt);
    }

    [Fact]
    public async Task Keeps_one_list_per_channel_and_ignores_another_channels()
    {
        Save("@someone-else", Video("theirs", 5));

        var videos = await Store().GetAsync(CancellationToken.None);

        Assert.Equal(["a", "b"], videos!.Select(v => v.Id));
        Assert.NotNull(Saved("@someone-else"));
        Assert.NotNull(Saved("@me"));
    }

    [Fact]
    public async Task Changing_the_channel_shows_the_new_channels_videos()
    {
        var store = Store();
        await store.GetAsync(CancellationToken.None);

        _options.Channel = "@Other";
        _youTube.Videos = [Video("other", 1)];

        Assert.Equal(["other"], (await store.GetAsync(CancellationToken.None))!.Select(v => v.Id));
    }

    [Fact]
    public async Task Clearing_reads_the_list_again_from_the_database()
    {
        var store = Store();
        await store.GetAsync(CancellationToken.None);
        using (var db = _db.Open())
        {
            db.YouTubeSnapshots.Find("@me")!.Videos = JsonSerializer.Serialize(new[] { Video("edited", 1) }, JsonSerializerOptions.Web);
            db.SaveChanges();
        }

        store.Clear();

        Assert.Equal(["edited"], (await store.GetAsync(CancellationToken.None))!.Select(v => v.Id));
        Assert.Equal(1, _youTube.Calls);
    }

    [Fact]
    public async Task Requests_arriving_together_ask_YouTube_once()
    {
        _youTube.Gate = new TaskCompletionSource();
        var store = Store();

        var requests = Enumerable.Range(0, 5).Select(_ => store.GetAsync(CancellationToken.None)).ToList();
        _youTube.Gate.SetResult();
        var answers = await Task.WhenAll(requests);

        Assert.Equal(1, _youTube.Calls);
        Assert.All(answers, videos => Assert.Equal(["a", "b"], videos!.Select(v => v.Id)));
    }

    [Fact]
    public async Task Still_shows_the_videos_when_the_database_cant_be_used()
    {
        var store = new YouTubeVideoStore(new BrokenScopes(), _youTube, TestOptions.Monitor(_options), _time, NullLogger<YouTubeVideoStore>.Instance);

        Assert.Equal(["a", "b"], (await store.GetAsync(CancellationToken.None))!.Select(v => v.Id));
        Assert.True(await store.RefreshAsync(CancellationToken.None));
    }

    [Fact]
    public async Task Stops_when_the_request_is_cancelled()
    {
        _youTube.Gate = new TaskCompletionSource();
        using var cancel = new CancellationTokenSource();
        var request = Store().GetAsync(cancel.Token);

        await cancel.CancelAsync();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => request);
    }

    /// <summary>Every database scope fails, like a database that's down.</summary>
    private sealed class BrokenScopes : Microsoft.Extensions.DependencyInjection.IServiceScopeFactory
    {
        public Microsoft.Extensions.DependencyInjection.IServiceScope CreateScope() => throw new InvalidOperationException("The database is down.");
    }
}
