using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Terms.TermsShared;

namespace Portfolio.Api.Features.Terms;

/// <summary>Admin only. Replaces the terms and returns them as stored (trimmed), with the new date.</summary>
public sealed class UpdateTerms : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/terms").MapPut("/", Handle).WithName("UpdateTerms").RequireAuthorization();

    public static async Task<Results<Ok<TermsDocument>, ValidationProblem>> Handle(
        TermsContent content,
        PortfolioDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var errors = TermsRules.Validate(content);
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var normalized = TermsRules.Normalize(content);
        var page = await db.TermsPages.FindAsync([TermsPage.SingletonId], cancellationToken);
        if (page is null)
        {
            page = new TermsPage { Id = TermsPage.SingletonId, Content = "" };
            db.TermsPages.Add(page);
        }
        page.Content = JsonSerializer.Serialize(normalized, Json);
        page.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.Ok(TermsDocument.From(normalized, page.UpdatedAt));
    }
}
