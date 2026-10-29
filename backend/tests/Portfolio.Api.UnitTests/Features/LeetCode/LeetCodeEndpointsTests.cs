using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.About;
using Portfolio.Api.Features.Files;
using Portfolio.Api.Features.LeetCode;

namespace Portfolio.Api.UnitTests.Features.LeetCode;

public class LeetCodeEndpointsTests
{
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 21, 12, 0, 0, TimeSpan.Zero));
    private readonly PortfolioDbContext _db = new(new DbContextOptionsBuilder<PortfolioDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    private readonly FakeLeetCode _leetCode = new();

    private LeetCodeStatsService Stats => new(_db, _leetCode, new LeetCodeMemoryCache(), _time, NullLogger<LeetCodeStatsService>.Instance);

    private Task SetUsernameAsync(string username) =>
        UpdateAbout.Handle(AboutDefaults.Content with { ProblemSolving = new ProblemSolving(username, []) }, _db, new DatabaseFileStorage(_db, _time), _time, default);

    [Fact]
    public async Task Without_a_username_there_is_nothing_to_show_and_leetcode_is_not_asked()
    {
        var result = await GetLeetCodeStats.Handle(_db, Stats, default);

        Assert.IsType<NoContent>(result.Result);
        Assert.Equal(0, _leetCode.Calls);
    }

    [Fact]
    public async Task The_stats_of_the_saved_username_are_shown()
    {
        await SetUsernameAsync("neetcode");

        var result = await GetLeetCodeStats.Handle(_db, Stats, default);

        var stats = Assert.IsType<Ok<LeetCodeStats>>(result.Result).Value!;
        Assert.Equal(("neetcode", 205), (stats.Username, stats.Solved.All));
        Assert.Equal(["neetcode"], _leetCode.Asked);
    }

    [Fact]
    public async Task An_unknown_user_is_not_found()
    {
        await SetUsernameAsync("nobody");

        Assert.IsType<NotFound>((await GetLeetCodeStats.Handle(_db, Stats, default)).Result);
    }

    [Fact]
    public async Task LeetCode_being_down_with_nothing_saved_is_a_503()
    {
        await SetUsernameAsync("neetcode");
        _leetCode.Fails = true;

        var problem = Assert.IsType<ProblemHttpResult>((await GetLeetCodeStats.Handle(_db, Stats, default)).Result);

        Assert.Equal(503, problem.StatusCode);
    }

    [Fact]
    public async Task While_leetcode_is_down_the_saved_stats_are_shown()
    {
        await SetUsernameAsync("neetcode");
        await GetLeetCodeStats.Handle(_db, Stats, default);
        _time.Advance(TimeSpan.FromDays(2));
        _leetCode.Fails = true;

        var result = await GetLeetCodeStats.Handle(_db, Stats, default);

        Assert.Equal(205, Assert.IsType<Ok<LeetCodeStats>>(result.Result).Value!.Solved.All);
        Assert.Equal(2, _leetCode.Calls);
    }

    private sealed class FakeLeetCode : ILeetCodeClient
    {
        public int Calls;
        public bool Fails;
        public List<string> Asked { get; } = [];

        public Task<LeetCodeStats?> FetchAsync(string username, CancellationToken cancellationToken)
        {
            Calls++;
            Asked.Add(username);
            if (Fails) throw new HttpRequestException("LeetCode is down");
            return Task.FromResult(username == "nobody"
                ? null
                : new LeetCodeStats(username, new DifficultyCounts(205, 103, 98, 4), new DifficultyCounts(4000, 900, 2100, 1000), DateTimeOffset.UnixEpoch));
        }
    }
}
