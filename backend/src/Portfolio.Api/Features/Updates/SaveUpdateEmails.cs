using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Updates.UpdateEmailsShared;

namespace Portfolio.Api.Features.Updates;

/// <summary>Replaces the wording; returns it as stored (trimmed).</summary>
public sealed class SaveUpdateEmails : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/updates/emails").RequireAuthorization().MapPut("/", Handle).WithName("SaveUpdateEmails");

    public static async Task<Results<Ok<UpdateEmailsDocument>, ValidationProblem>> Handle(
        UpdateEmailWording wording,
        PortfolioDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var errors = UpdateEmailRules.Validate(wording);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var normalized = UpdateEmailRules.Normalize(wording);
        var page = await db.UpdateEmailsPages.FindAsync([UpdateEmailsPage.SingletonId], cancellationToken);
        if (page is null)
        {
            page = new UpdateEmailsPage { Id = UpdateEmailsPage.SingletonId, Content = "" };
            db.UpdateEmailsPages.Add(page);
        }
        page.Content = JsonSerializer.Serialize(normalized, Json);
        page.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.Ok(new UpdateEmailsDocument(normalized, UpdateEmailDefaults.Wording, page.UpdatedAt));
    }
}
