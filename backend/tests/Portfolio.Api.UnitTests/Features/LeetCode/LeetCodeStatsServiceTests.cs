using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.LeetCode;

namespace Portfolio.Api.UnitTests.Features.LeetCode;

public class LeetCodeStatsServiceTests
{
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 11, 12, 0, 0, TimeSpan.Zero));
    private readonly FakeLeetCode _leetCode;
    private readonly string _database = Guid.NewGuid().ToString();
    private LeetCodeMemoryCache _memory = new();

    public LeetCodeStatsServiceTests() => _leetCode = new FakeLeetCode(_time);

    /// <summary>A new service each time, like each request gets; the memory cache is shared, like the singleton.</summary>
    private LeetCodeStatsService Service() => new(
        new PortfolioDbContext(new DbContextOptionsBuilder<PortfolioDbContext>().UseInMemoryDatabase(_database).Options),
        _leetCode, _memory, _time, NullLogger<LeetCodeStatsService>.Instance);

    [Fact]
    public async Task Asks_leetcode_once_then_answers_from_memory_until_the_stats_are_six_hours_old()
    {
        var first = await Service().GetAsync("neetcode", default);
        _time.Advance(TimeSpan.FromHours(5));
        var second = await Service().GetAsync("NeetCode", default);

        Assert.Equal(1, _leetCode.Calls);
        Assert.Equal(first, second);
        Assert.Equal(_time.GetUtcNow() - TimeSpan.FromHours(5), second.Stats!.FetchedAt);

        _time.Advance(TimeSpan.FromHours(1));
        var third = await Service().GetAsync("neetcode", default);

        Assert.Equal(2, _leetCode.Calls);
        Assert.Equal(_time.GetUtcNow(), third.Stats!.FetchedAt);
    }

    [Fact]
    public async Task Visitors_arriving_together_cause_one_call()
    {
        _leetCode.Delay = TimeSpan.FromMilliseconds(100);

        var all = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => Service().GetAsync("neetcode", default)));

        Assert.Equal(1, _leetCode.Calls);
        Assert.All(all, lookup => Assert.Equal(205, lookup.Stats!.Solved.All));
    }

    [Fact]
    public async Task After_a_restart_the_saved_stats_are_used_while_fresh()
    {
        await Service().GetAsync("neetcode", default);
        _memory = new LeetCodeMemoryCache();
        _time.Advance(TimeSpan.FromHours(2));

        var lookup = await Service().GetAsync("neetcode", default);

        Assert.Equal(1, _leetCode.Calls);
        Assert.Equal(205, lookup.Stats!.Solved.All);
    }

    [Fact]
    public async Task While_leetcode_is_down_the_saved_stats_are_shown_and_it_is_retried_after_15_minutes()
    {
        await Service().GetAsync("neetcode", default);
        var fetchedAt = _time.GetUtcNow();
        _time.Advance(TimeSpan.FromHours(7));
        _leetCode.Fails = true;

        var lookup = await Service().GetAsync("neetcode", default);
        _time.Advance(TimeSpan.FromMinutes(10));
        await Service().GetAsync("neetcode", default);

        Assert.Equal(fetchedAt, lookup.Stats!.FetchedAt);
        Assert.Equal(2, _leetCode.Calls);

        _time.Advance(TimeSpan.FromMinutes(5));
        _leetCode.Fails = false;
        var recovered = await Service().GetAsync("neetcode", default);

        Assert.Equal(3, _leetCode.Calls);
        Assert.Equal(_time.GetUtcNow(), recovered.Stats!.FetchedAt);
    }

    [Fact]
    public async Task Without_saved_stats_a_failure_is_unavailable()
    {
        _leetCode.Fails = true;

        Assert.Equal(LeetCodeLookup.Unavailable, await Service().GetAsync("neetcode", default));
    }

    [Fact]
    public async Task An_unknown_user_is_remembered_too()
    {
        var first = await Service().GetAsync("nobody", default);
        var second = await Service().GetAsync("nobody", default);

        Assert.True(first.NoSuchUser);
        Assert.Equal(first, second);
        Assert.Equal(1, _leetCode.Calls);
    }

    private sealed class FakeLeetCode(TimeProvider time) : ILeetCodeClient
    {
        public int Calls;
        public bool Fails;
        public TimeSpan Delay;

        public async Task<LeetCodeStats?> FetchAsync(string username, CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref Calls);
            if (Delay > TimeSpan.Zero) await Task.Delay(Delay, cancellationToken);
            if (Fails) throw new HttpRequestException("LeetCode is down");
            return username == "nobody" ? null : new LeetCodeStats("NeetCode", new DifficultyCounts(205, 103, 98, 4), new DifficultyCounts(4073, 969, 2124, 980), time.GetUtcNow());
        }
    }
}
