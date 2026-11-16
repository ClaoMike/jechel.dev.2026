using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Resume.ResumeShared;

namespace Portfolio.Api.Features.Resume;

/// <summary>Admin only. Saves the sections and skills without generating.</summary>
public sealed class SaveResumeChoices : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/resume").MapPut("/choices", Handle).WithName("SaveResumeChoices").RequireAuthorization();

    public static async Task<Results<Ok<ResumeSettingsDto>, ValidationProblem>> Handle(
        ResumeChoices request,
        PortfolioDbContext db,
        CancellationToken cancellationToken)
    {
        var errors = ResumeRules.Validate(request);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var row = await RowAsync(db, cancellationToken);
        SetChoices(row, ResumeRules.Normalize(request));
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(ToDto(row));
    }
}
