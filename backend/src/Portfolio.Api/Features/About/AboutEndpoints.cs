using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.About;

public static class AboutEndpoints
{
    private static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;

    public static IEndpointRouteBuilder MapAboutEndpoints(this IEndpointRouteBuilder app)
    {
        var about = app.MapGroup("/about");

        about.MapGet("/", GetAbout).WithName("GetAbout");
        about.MapPut("/", UpdateAbout).WithName("UpdateAbout").RequireAuthorization();

        return app;
    }

    /// <summary>Public. The placeholder content until the admin first saves the page.</summary>
    public static async Task<Ok<AboutContent>> GetAbout(PortfolioDbContext db, CancellationToken cancellationToken)
    {
        var json = await db.AboutPages
            .AsNoTracking()
            .Where(p => p.Id == AboutPage.SingletonId)
            .Select(p => p.Content)
            .FirstOrDefaultAsync(cancellationToken);

        return TypedResults.Ok(json is null ? AboutDefaults.Content : JsonSerializer.Deserialize<AboutContent>(json, Json)!);
    }

    /// <summary>Admin only. Replaces the whole page and returns it as stored (trimmed, sorted).</summary>
    public static async Task<Results<Ok<AboutContent>, ValidationProblem>> UpdateAbout(
        AboutContent content,
        PortfolioDbContext db,
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
        page.Content = JsonSerializer.Serialize(normalized, Json);
        page.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.Ok(normalized);
    }
}
