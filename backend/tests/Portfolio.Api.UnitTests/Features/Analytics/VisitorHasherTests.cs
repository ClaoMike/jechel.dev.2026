using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Features.Analytics;

namespace Portfolio.Api.UnitTests.Features.Analytics;

public class VisitorHasherTests
{
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 12, 9, 0, 0, TimeSpan.Zero));

    [Fact]
    public void The_same_visitor_gets_the_same_id_all_day()
    {
        var hasher = new VisitorHasher(_time);
        var morning = hasher.Hash("203.0.113.7", "Firefox");

        _time.Advance(TimeSpan.FromHours(14));

        Assert.Equal(morning, hasher.Hash("203.0.113.7", "Firefox"));
        Assert.Equal(64, morning.Length);
    }

    [Fact]
    public void Another_visitor_or_another_day_gets_another_id()
    {
        var hasher = new VisitorHasher(_time);
        var today = hasher.Hash("203.0.113.7", "Firefox");

        Assert.NotEqual(today, hasher.Hash("203.0.113.8", "Firefox"));
        Assert.NotEqual(today, hasher.Hash("203.0.113.7", "Safari"));

        _time.Advance(TimeSpan.FromDays(1));
        Assert.NotEqual(today, hasher.Hash("203.0.113.7", "Firefox"));
    }

    [Fact]
    public void The_id_is_not_the_plain_hash_of_the_address()
    {
        var hasher = new VisitorHasher(_time);
        var plain = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData("203.0.113.7|Firefox"u8));

        Assert.NotEqual(plain, hasher.Hash("203.0.113.7", "Firefox"));
    }
}
