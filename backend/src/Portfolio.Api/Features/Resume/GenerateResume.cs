using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using Portfolio.Api.Features.About;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.LeetCode;
using static Portfolio.Api.Features.Resume.ResumeShared;

namespace Portfolio.Api.Features.Resume;

/// <summary>
/// Admin only. Saves the choices, makes both PDFs from the About Me page and the saved contact
/// details as they are now, and points the page's "Download résumé" button at the public one.
/// </summary>
public sealed class GenerateResume : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/resume").MapPost("/generate", Handle).WithName("GenerateResume").RequireAuthorization();

    public static async Task<Results<Ok<ResumeSettingsDto>, ValidationProblem>> Handle(
        ResumeChoices request,
        PortfolioDbContext db,
        LeetCodeStatsService leetCode,
        IOptions<SiteOptions> site,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var errors = ResumeRules.Validate(request);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var choices = ResumeRules.Normalize(request);
        var about = await AboutShared.LoadAsync(db, cancellationToken);
        LeetCodeStats? stats = null;
        if (choices.Sections!.Contains(ResumeSections.ProblemSolving) && about.ProblemSolving.LeetCodeUsername.Length > 0)
        {
            stats = (await leetCode.GetAsync(about.ProblemSolving.LeetCodeUsername, cancellationToken)).Stats;
        }

        var row = await RowAsync(db, cancellationToken);
        SetChoices(row, choices);

        var now = time.GetUtcNow();
        var input = new ResumeInput(about, new ResumeContact(row.Phone, row.Email, row.Headline), choices, stats, IncludePrivate: false, DateOnly.FromDateTime(now.UtcDateTime), site.Value.PublicUrl.TrimEnd('/'));
        row.PublicPdf = ResumeDocument.Build(input);
        row.PrivatePdf = ResumeDocument.Build(input with { IncludePrivate = true });
        row.GeneratedAt = now;

        // Visitors' "Download résumé" now gets this one.
        var page = await db.AboutPages.FindAsync([AboutPage.SingletonId], cancellationToken);
        if (page is null)
        {
            page = new AboutPage { Id = AboutPage.SingletonId, Content = "" };
            db.AboutPages.Add(page);
        }
        page.Content = AboutJson.Serialize(about with { Links = about.Links with { ResumeUrl = $"{PublicPath}?v={now.ToUnixTimeSeconds()}" } });
        page.UpdatedAt = now;

        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(ToDto(row));
    }
}
