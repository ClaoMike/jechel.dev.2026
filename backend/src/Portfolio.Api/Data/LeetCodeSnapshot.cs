namespace Portfolio.Api.Data;

/// <summary>
/// The last LeetCode stats fetched for a user (Features/LeetCode), kept so they survive restarts
/// and can be shown while LeetCode is unreachable.
/// </summary>
public class LeetCodeSnapshot
{
    /// <summary>Lower-cased: LeetCode usernames aren't case-sensitive.</summary>
    public required string Username { get; set; }

    /// <summary>A LeetCodeStats, as JSON.</summary>
    public required string Stats { get; set; }

    public DateTimeOffset FetchedAt { get; set; }
}
