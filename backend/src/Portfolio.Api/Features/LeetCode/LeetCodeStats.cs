namespace Portfolio.Api.Features.LeetCode;

/// <summary>A number per difficulty; <paramref name="All"/> is their sum.</summary>
public record DifficultyCounts(int All, int Easy, int Medium, int Hard);

/// <summary>What the "Problem solving" section shows.</summary>
/// <param name="Username">As LeetCode spells it.</param>
/// <param name="Solved">Problems the user has solved.</param>
/// <param name="Total">Problems on LeetCode.</param>
/// <param name="FetchedAt">When LeetCode was asked. Older than <see cref="LeetCodeStatsService.FreshFor"/> means it couldn't be reached since.</param>
public record LeetCodeStats(string Username, DifficultyCounts Solved, DifficultyCounts Total, DateTimeOffset FetchedAt);
