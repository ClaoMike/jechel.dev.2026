using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Resume.ResumeShared;

namespace Portfolio.Api.Features.Resume;

/// <summary>Admin only. Defaults (<see cref="ResumeSections.Defaults"/>) until the first save.</summary>
public sealed class GetResumeSettings : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/resume").MapGet("/settings", Handle).WithName("GetResumeSettings").RequireAuthorization();

    public static async Task<Ok<ResumeSettingsDto>> Handle(PortfolioDbContext db, HttpContext http, CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "private, no-store";
        var row = await db.ResumeSettings.AsNoTracking().FirstOrDefaultAsync(r => r.Id == ResumeSettings.SingletonId, cancellationToken);
        return TypedResults.Ok(ToDto(row));
    }
}
