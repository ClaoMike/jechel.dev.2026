using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Terms;

public static class TermsEndpoints
{
    private static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;

    public static IEndpointRouteBuilder MapTermsEndpoints(this IEndpointRouteBuilder app)
    {
        var terms = app.MapGroup("/terms");

        terms.MapGet("/", GetTerms).WithName("GetTerms");
        terms.MapPut("/", UpdateTerms).WithName("UpdateTerms").RequireAuthorization();

        return app;
    }

    /// <summary>Public. The default terms (dated TermsDefaults.UpdatedAt) until the admin first saves them.</summary>
    public static async Task<Ok<TermsDocument>> GetTerms(PortfolioDbContext db, CancellationToken cancellationToken)
    {
        var page = await db.TermsPages
            .AsNoTracking()
            .Where(p => p.Id == TermsPage.SingletonId)
            .Select(p => new { p.Content, p.UpdatedAt })
            .FirstOrDefaultAsync(cancellationToken);

        return TypedResults.Ok(page is null
            ? TermsDocument.From(TermsDefaults.Content, TermsDefaults.UpdatedAt)
            : TermsDocument.From(JsonSerializer.Deserialize<TermsContent>(page.Content, Json)!, page.UpdatedAt));
    }

    /// <summary>Admin only. Replaces the terms and returns them as stored (trimmed), with the new date.</summary>
    public static async Task<Results<Ok<TermsDocument>, ValidationProblem>> UpdateTerms(
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
