using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Resume.ResumeShared;

namespace Portfolio.Api.Features.Resume;

/// <summary>Admin only. The same résumé with the email and phone number.</summary>
public sealed class GetPrivateResume : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/resume").MapGet("/private", Handle).WithName("GetPrivateResume").RequireAuthorization();

    public static async Task<Results<FileContentHttpResult, NotFound>> Handle(PortfolioDbContext db, HttpContext http, CancellationToken cancellationToken, bool inline = false)
    {
        var row = await db.ResumeSettings.AsNoTracking()
            .Where(r => r.Id == ResumeSettings.SingletonId && r.PrivatePdf != null)
            .Select(r => new { r.PrivatePdf, r.GeneratedAt })
            .FirstOrDefaultAsync(cancellationToken);
        if (row is null) return TypedResults.NotFound();

        http.Response.Headers.CacheControl = "private, no-store";
        return Pdf(http, row.PrivatePdf!, inline, row.GeneratedAt);
    }
}
