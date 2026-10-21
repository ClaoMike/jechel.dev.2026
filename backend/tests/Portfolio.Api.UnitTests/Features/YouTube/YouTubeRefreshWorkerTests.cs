using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Features.YouTube;

namespace Portfolio.Api.UnitTests.Features.YouTube;

public class YouTubeRefreshWorkerTests
{
    private readonly FakeYouTubeClient _youTube = new();
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 21, 12, 0, 0, TimeSpan.Zero));
    private readonly YouTubeOptions _options = new() { Channel = "@me", ApiKey = "key" };

    private readonly TestDatabase _db = new();

    private YouTubeRefreshWorker Worker() =>
        new(new YouTubeVideoStore(_db.Scopes, _youTube, TestOptions.Monitor(_options), _time, NullLogger<YouTubeVideoStore>.Instance), TestOptions.Monitor(_options), _time);

    public YouTubeRefreshWorkerTests()
    {
        // The first use of a database builds EF's model (slow): not while a test waits on the worker.
        using var db = _db.Open();
        _ = db.YouTubeSnapshots.Count();
    }

    /// <summary>Waits until YouTube was asked <paramref name="calls"/> times (the worker runs on its own).</summary>
    private async Task CallsReach(int calls)
    {
        for (var i = 0; i < 500 && _youTube.Calls < calls; i++) await Task.Delay(10);
        Assert.Equal(calls, _youTube.Calls);
    }

    /// <summary>Waits until the list fetched at <paramref name="at"/> is saved: the worker's last step before it waits.</summary>
    private async Task SavedAt(DateTimeOffset at)
    {
        for (var i = 0; i < 500 && Saved() != at; i++) await Task.Delay(10);
        Assert.Equal(at, Saved());
    }

    private DateTimeOffset? Saved()
    {
        using var db = _db.Open();
        return db.YouTubeSnapshots.Find("@me")?.FetchedAt;
    }

    /// <summary>Lets the worker finish what it's doing and reach its wait before the clock moves on.</summary>
    private static Task Settle() => Task.Delay(100);

    [Fact]
    public async Task Refreshes_as_the_API_starts_then_every_hour()
    {
        using var worker = Worker();
        await worker.StartAsync(CancellationToken.None);
        await CallsReach(1);
        await SavedAt(_time.GetUtcNow());
        await Settle();

        _time.Advance(YouTubeVideoStore.FreshFor - TimeSpan.FromSeconds(1));
        await Settle();
        Assert.Equal(1, _youTube.Calls);

        _time.Advance(TimeSpan.FromSeconds(1));
        await CallsReach(2);
        await SavedAt(_time.GetUtcNow());
        await worker.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task After_YouTube_failed_tries_again_five_minutes_later()
    {
        _youTube.Fails = true;
        using var worker = Worker();
        await worker.StartAsync(CancellationToken.None);
        await CallsReach(1);
        await Settle();

        _time.Advance(YouTubeVideoStore.RetryAfter);
        await CallsReach(2);
        await worker.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Doesnt_ask_YouTube_until_its_set_up()
    {
        _options.ApiKey = "";
        using var worker = Worker();
        await worker.StartAsync(CancellationToken.None);
        await Settle();

        _time.Advance(YouTubeVideoStore.FreshFor);
        await Settle();
        Assert.Equal(0, _youTube.Calls);

        _options.ApiKey = "key";
        _time.Advance(YouTubeVideoStore.FreshFor);
        await CallsReach(1);
        await worker.StopAsync(CancellationToken.None);
    }
}
