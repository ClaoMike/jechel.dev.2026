using Portfolio.Api.Features.Analytics;

namespace Portfolio.Api.UnitTests.Features.Analytics;

public class AnalyticsRangeTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 12, 14, 37, 20, TimeSpan.Zero);

    private static DateTimeOffset At(int year, int month, int day, int hour = 0, int minute = 0) => new(year, month, day, hour, minute, 0, TimeSpan.Zero);

    [Theory]
    [InlineData("1h", "5m", 12)]
    [InlineData("24h", "hour", 24)]
    [InlineData("7d", "day", 7)]
    [InlineData("30d", "day", 30)]
    [InlineData("90d", "day", 90)]
    [InlineData("1y", "month", 12)]
    [InlineData("5y", "month", 60)]
    public void Each_period_has_its_column_size_and_count(string name, string bucketSize, int count)
    {
        var range = AnalyticsRange.Plan(name, Now, null);

        Assert.Equal((name, bucketSize, count), (range.Name, range.BucketSize, range.Buckets.Count));
    }

    [Fact]
    public void Columns_are_aligned_and_end_with_the_current_one()
    {
        Assert.Equal((At(2026, 10, 12, 13, 40), At(2026, 10, 12, 14, 35)), Ends(AnalyticsRange.Plan("1h", Now, null)));
        Assert.Equal((At(2026, 10, 11, 15), At(2026, 10, 12, 14)), Ends(AnalyticsRange.Plan("24h", Now, null)));
        Assert.Equal((At(2026, 10, 6), At(2026, 10, 12)), Ends(AnalyticsRange.Plan("7d", Now, null)));
        Assert.Equal((At(2025, 11, 1), At(2026, 10, 1)), Ends(AnalyticsRange.Plan("1y", Now, null)));
        Assert.Equal((At(2021, 11, 1), At(2026, 10, 1)), Ends(AnalyticsRange.Plan("5y", Now, null)));

        static (DateTimeOffset, DateTimeOffset) Ends(AnalyticsRange range) => (range.From, range.Buckets[^1]);
    }

    [Fact]
    public void A_time_falls_in_the_column_that_starts_before_it()
    {
        var range = AnalyticsRange.Plan("1h", Now, null);

        Assert.Equal(At(2026, 10, 12, 14, 0), range.BucketOf(At(2026, 10, 12, 14, 4)));
        Assert.Equal(At(2026, 10, 12, 14, 5), range.BucketOf(At(2026, 10, 12, 14, 5)));
        Assert.Equal(At(2026, 10, 12, 14, 5), range.BucketOf(new DateTimeOffset(2026, 10, 12, 16, 9, 0, TimeSpan.FromHours(2))));
    }

    [Fact]
    public void All_time_goes_by_month_from_the_first_visit_then_by_year_when_long()
    {
        var recent = AnalyticsRange.Plan("all", Now, At(2026, 8, 20, 9));
        Assert.Equal(("month", At(2026, 8, 1), 3), (recent.BucketSize, recent.From, recent.Buckets.Count));

        var old = AnalyticsRange.Plan("all", Now, At(2018, 3, 5));
        Assert.Equal(("year", At(2018, 1, 1), 9), (old.BucketSize, old.From, old.Buckets.Count));

        var none = AnalyticsRange.Plan("all", Now, null);
        Assert.Equal(("month", At(2026, 10, 1), 1), (none.BucketSize, none.From, none.Buckets.Count));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("2w")]
    public void An_unknown_period_is_30_days(string? name)
    {
        var range = AnalyticsRange.Plan(name, Now, null);

        Assert.Equal(("30d", 30), (range.Name, range.Buckets.Count));
    }
}
