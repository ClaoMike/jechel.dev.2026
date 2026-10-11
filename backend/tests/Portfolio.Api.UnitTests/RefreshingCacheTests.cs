using Microsoft.Extensions.Time.Testing;

namespace Portfolio.Api.UnitTests;

public class RefreshingCacheTests
{
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 11, 12, 0, 0, TimeSpan.Zero));
    private readonly RefreshingCache<string> _cache;
    private int _calls;
    private bool _fails;

    public RefreshingCacheTests() => _cache = new(_time, TimeSpan.FromHours(1), TimeSpan.FromMinutes(5));

    private async Task<string> Fetch(CancellationToken cancellationToken)
    {
        var call = Interlocked.Increment(ref _calls);
        await Task.Delay(20, cancellationToken);
        if (_fails) throw new HttpRequestException("down");
        return $"value {call}";
    }

    [Fact]
    public async Task Fetches_once_then_again_when_an_hour_old()
    {
        Assert.Equal("value 1", await _cache.GetAsync(Fetch, default));
        _time.Advance(TimeSpan.FromMinutes(59));
        Assert.Equal("value 1", await _cache.GetAsync(Fetch, default));
        _time.Advance(TimeSpan.FromMinutes(1));
        Assert.Equal("value 2", await _cache.GetAsync(Fetch, default));
    }

    [Fact]
    public async Task Requests_arriving_together_cause_one_fetch()
    {
        var values = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => _cache.GetAsync(Fetch, default)));

        Assert.Equal(1, _calls);
        Assert.All(values, v => Assert.Equal("value 1", v));
    }

    [Fact]
    public async Task On_failure_keeps_the_last_value_and_retries_after_five_minutes()
    {
        await _cache.GetAsync(Fetch, default);
        _time.Advance(TimeSpan.FromHours(2));
        _fails = true;

        Assert.Equal("value 1", await _cache.GetAsync(Fetch, default));
        _time.Advance(TimeSpan.FromMinutes(4));
        Assert.Equal("value 1", await _cache.GetAsync(Fetch, default));
        Assert.Equal(2, _calls);

        _fails = false;
        _time.Advance(TimeSpan.FromMinutes(1));
        Assert.Equal("value 3", await _cache.GetAsync(Fetch, default));
    }

    [Fact]
    public async Task Without_a_value_a_failure_is_thrown_and_the_next_request_tries_again()
    {
        _fails = true;
        await Assert.ThrowsAsync<HttpRequestException>(() => _cache.GetAsync(Fetch, default));

        _fails = false;
        Assert.Equal("value 2", await _cache.GetAsync(Fetch, default));
    }
}
