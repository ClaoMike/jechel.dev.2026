using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Files;

namespace Portfolio.Api.Features.About;

/// <summary>
/// Admin only. Replaces the whole page and returns it as stored (trimmed). Deletes the
/// uploaded files the page no longer uses, e.g. a replaced photo.
/// </summary>
public sealed class UpdateAbout : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/about").MapPut("/", Handle).WithName("UpdateAbout").RequireAuthorization();

    public static async Task<Results<Ok<AboutContent>, ValidationProblem>> Handle(
        AboutContent content,
        PortfolioDbContext db,
        IFileStorage files,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var errors = AboutRules.Validate(content);
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var normalized = AboutRules.Normalize(content);
        var page = await db.AboutPages.FindAsync([AboutPage.SingletonId], cancellationToken);
        if (page is null)
        {
            page = new AboutPage { Id = AboutPage.SingletonId, Content = "" };
            db.AboutPages.Add(page);
        }
        page.Content = AboutJson.Serialize(normalized);
        page.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);

        await FileCleanup.DeleteUnusedAsync(db, files, time, cancellationToken);

        return TypedResults.Ok(normalized);
    }
}
