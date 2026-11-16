using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Terms.TermsShared;

namespace Portfolio.Api.Features.Terms;

/// <summary>Public. The default terms (dated TermsDefaults.UpdatedAt) until the admin first saves them.</summary>
public sealed class GetTerms : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/terms").MapGet("/", Handle).WithName("GetTerms");

    public static async Task<Ok<TermsDocument>> Handle(PortfolioDbContext db, CancellationToken cancellationToken)
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
}
