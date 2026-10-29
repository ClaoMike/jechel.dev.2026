using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Resume.ResumeShared;

namespace Portfolio.Api.Features.Resume;

/// <summary>Admin only. The phone, email and headline (edited with the About Me profile; only the headline is shown publicly).</summary>
public sealed class SaveResumeContact : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/resume").MapPut("/contact", Handle).WithName("SaveResumeContact").RequireAuthorization();

    public static async Task<Results<Ok<ResumeSettingsDto>, ValidationProblem>> Handle(
        ResumeContact request,
        PortfolioDbContext db,
        CancellationToken cancellationToken)
    {
        var errors = ResumeRules.Validate(request);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var contact = ResumeRules.Normalize(request);
        var row = await RowAsync(db, cancellationToken);
        row.Phone = contact.Phone!;
        row.Email = contact.Email!;
        row.Headline = contact.Headline!;
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(ToDto(row));
    }
}
