using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Data;
using Portfolio.Api.Features.About;

namespace Portfolio.Api.Features.LeetCode;

public static class LeetCodeEndpoints
{
    public static IEndpointRouteBuilder MapLeetCodeEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/leetcode", GetStats).WithName("GetLeetCodeStats");
        return app;
    }

    /// <summary>
    /// Public. The stats of the LeetCode user set on the About Me page (only that one, so the
    /// API can't be used to look anyone up): 204 when none is set, 404 when LeetCode doesn't
    /// know the user, 503 when LeetCode can't be reached and nothing was saved yet.
    /// </summary>
    public static async Task<Results<Ok<LeetCodeStats>, NoContent, NotFound, ProblemHttpResult>> GetStats(
        PortfolioDbContext db,
        LeetCodeStatsService stats,
        CancellationToken cancellationToken)
    {
        var page = await AboutEndpoints.LoadAsync(db, cancellationToken);
        var username = page.ProblemSolving.LeetCodeUsername;
        if (username.Length == 0) return TypedResults.NoContent();

        var lookup = await stats.GetAsync(username, cancellationToken);
        if (lookup.NoSuchUser) return TypedResults.NotFound();
        return lookup.Stats is { } found
            ? TypedResults.Ok(found)
            : TypedResults.Problem("LeetCode can't be reached right now.", statusCode: StatusCodes.Status503ServiceUnavailable);
    }
}
