using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Files;

namespace Portfolio.Api.Features.About;

public static class AboutEndpoints
{
    /// <summary>Uploads not used by the page are deleted on save once they're this old (an editor may still be open with them).</summary>
    public static readonly TimeSpan UnusedUploadGracePeriod = TimeSpan.FromDays(1);

    public static IEndpointRouteBuilder MapAboutEndpoints(this IEndpointRouteBuilder app)
    {
        var about = app.MapGroup("/about");

        about.MapGet("/", GetAbout).WithName("GetAbout");
        about.MapPut("/", UpdateAbout).WithName("UpdateAbout").RequireAuthorization();

        return app;
    }

    /// <summary>Public. The placeholder content until the admin first saves the page.</summary>
    public static async Task<Ok<AboutContent>> GetAbout(PortfolioDbContext db, CancellationToken cancellationToken) =>
        TypedResults.Ok(await LoadAsync(db, cancellationToken));

    /// <summary>The page as stored, or the placeholder content before the first save.</summary>
    public static async Task<AboutContent> LoadAsync(PortfolioDbContext db, CancellationToken cancellationToken)
    {
        var json = await db.AboutPages
            .AsNoTracking()
            .Where(p => p.Id == AboutPage.SingletonId)
            .Select(p => p.Content)
            .FirstOrDefaultAsync(cancellationToken);

        return json is null ? AboutDefaults.Content : AboutJson.Deserialize(json);
    }

    /// <summary>
    /// Admin only. Replaces the whole page and returns it as stored (trimmed). Deletes the
    /// uploaded files the page no longer uses, e.g. a replaced photo.
    /// </summary>
    public static async Task<Results<Ok<AboutContent>, ValidationProblem>> UpdateAbout(
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

        Guid[] used = [.. new[] { normalized.PhotoUrl, normalized.Links.ResumeUrl }.Concat(normalized.Papers.Select(p => p.FileUrl)).Select(FileRules.FileIdIn).OfType<Guid>()];
        await files.DeleteAllExceptAsync(used, time.GetUtcNow() - UnusedUploadGracePeriod, cancellationToken);

        return TypedResults.Ok(normalized);
    }
}
