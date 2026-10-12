namespace Portfolio.Api.Features.Analytics;

/// <summary>
/// The dashboard's periods, and the columns its chart splits each into. Columns are UTC and aligned
/// (on the 5 minutes, the hour, midnight, the 1st of the month), the last one being the current, partial one.
/// </summary>
public sealed record AnalyticsRange(string Name, string BucketSize, IReadOnlyList<DateTimeOffset> Buckets)
{
    public const string Default = "30d";

    /// <summary>Last hour, last 24 hours, 7 / 30 / 90 days, 12 months, 60 months, everything.</summary>
    public static readonly IReadOnlyList<string> Names = ["1h", "24h", "7d", "30d", "90d", "1y", "5y", "all"];

    public const string FiveMinutes = "5m";
    public const string Hour = "hour";
    public const string Day = "day";
    public const string Month = "month";
    public const string Year = "year";

    /// <summary>All time goes month by month up to this many months, then year by year.</summary>
    public const int MaxMonthsForAllTime = 72;

    /// <summary>Where the period starts: the first column's start.</summary>
    public DateTimeOffset From => Buckets[0];

    /// <summary>
    /// The period called <paramref name="name"/> (an unknown name is the default) ending now.
    /// <paramref name="firstVisit"/> is where "all" starts; with no visits it's just the current column.
    /// </summary>
    public static AnalyticsRange Plan(string? name, DateTimeOffset now, DateTimeOffset? firstVisit)
    {
        name = name is not null && Names.Contains(name) ? name : Default;
        now = now.ToUniversalTime();

        if (name == "all")
        {
            var first = Floor(firstVisit is { } visit && visit < now ? visit.ToUniversalTime() : now, Month);
            var months = (now.Year - first.Year) * 12 + now.Month - first.Month + 1;
            var size = months <= MaxMonthsForAllTime ? Month : Year;
            return new AnalyticsRange(name, size, Series(Floor(first, size), Floor(now, size), size));
        }

        var (bucketSize, count) = name switch
        {
            "1h" => (FiveMinutes, 12),
            "24h" => (Hour, 24),
            "7d" => (Day, 7),
            "90d" => (Day, 90),
            "1y" => (Month, 12),
            "5y" => (Month, 60),
            _ => (Day, 30),
        };
        var last = Floor(now, bucketSize);
        var start = Enumerable.Range(0, count - 1).Aggregate(last, (t, _) => Previous(t, bucketSize));
        return new AnalyticsRange(name, bucketSize, Series(start, last, bucketSize));
    }

    /// <summary>The start of the column that holds <paramref name="time"/>.</summary>
    public DateTimeOffset BucketOf(DateTimeOffset time) => Floor(time.ToUniversalTime(), BucketSize);

    public static DateTimeOffset Floor(DateTimeOffset t, string size) => size switch
    {
        FiveMinutes => new DateTimeOffset(t.Year, t.Month, t.Day, t.Hour, t.Minute - t.Minute % 5, 0, TimeSpan.Zero),
        Hour => new DateTimeOffset(t.Year, t.Month, t.Day, t.Hour, 0, 0, TimeSpan.Zero),
        Day => new DateTimeOffset(t.Year, t.Month, t.Day, 0, 0, 0, TimeSpan.Zero),
        Month => new DateTimeOffset(t.Year, t.Month, 1, 0, 0, 0, TimeSpan.Zero),
        Year => new DateTimeOffset(t.Year, 1, 1, 0, 0, 0, TimeSpan.Zero),
        _ => throw new ArgumentOutOfRangeException(nameof(size), size, null),
    };

    private static DateTimeOffset Next(DateTimeOffset t, string size) => size switch
    {
        FiveMinutes => t.AddMinutes(5),
        Hour => t.AddHours(1),
        Day => t.AddDays(1),
        Month => t.AddMonths(1),
        _ => t.AddYears(1),
    };

    private static DateTimeOffset Previous(DateTimeOffset t, string size) => size switch
    {
        FiveMinutes => t.AddMinutes(-5),
        Hour => t.AddHours(-1),
        Day => t.AddDays(-1),
        Month => t.AddMonths(-1),
        _ => t.AddYears(-1),
    };

    private static List<DateTimeOffset> Series(DateTimeOffset first, DateTimeOffset last, string size)
    {
        var buckets = new List<DateTimeOffset>();
        for (var t = first; t <= last; t = Next(t, size)) buckets.Add(t);
        return buckets;
    }
}
