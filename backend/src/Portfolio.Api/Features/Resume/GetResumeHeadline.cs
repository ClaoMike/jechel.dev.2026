using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Resume;

/// <summary>Public. The headline shown under the name on About Me ("" until the admin sets one); the phone and email stay private.</summary>
public sealed class GetResumeHeadline : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/resume").MapGet("/headline", Handle).WithName("GetResumeHeadline");

    public static async Task<Ok<ResumeHeadline>> Handle(PortfolioDbContext db, HttpContext http, CancellationToken cancellationToken)
    {
        var headline = await db.ResumeSettings.AsNoTracking()
            .Where(r => r.Id == ResumeSettings.SingletonId)
            .Select(r => r.Headline)
            .FirstOrDefaultAsync(cancellationToken);

        // The admin's edit shows at once for them (the app updates it); browsers revalidate every time.
        http.Response.Headers.CacheControl = "no-cache";
        return TypedResults.Ok(new ResumeHeadline(headline ?? ""));
    }
}
