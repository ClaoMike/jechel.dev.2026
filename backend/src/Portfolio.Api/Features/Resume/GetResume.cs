using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Resume.ResumeShared;

namespace Portfolio.Api.Features.Resume;

/// <summary>Public. The last generated résumé without the email and phone number; 404 before the first.</summary>
/// <param name="inline">True opens it in the browser instead of downloading it.</param>
public sealed class GetResume : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/resume").MapGet("/", Handle).WithName("GetResume");

    public static async Task<Results<FileContentHttpResult, NotFound>> Handle(PortfolioDbContext db, HttpContext http, CancellationToken cancellationToken, bool inline = false)
    {
        var row = await db.ResumeSettings.AsNoTracking()
            .Where(r => r.Id == ResumeSettings.SingletonId && r.PublicPdf != null)
            .Select(r => new { r.PublicPdf, r.GeneratedAt })
            .FirstOrDefaultAsync(cancellationToken);
        if (row is null) return TypedResults.NotFound();

        // The link changes (?v=) with every generation, so a short cache is safe.
        http.Response.Headers.CacheControl = "public, max-age=300";
        return Pdf(http, row.PublicPdf!, inline, row.GeneratedAt);
    }
}
