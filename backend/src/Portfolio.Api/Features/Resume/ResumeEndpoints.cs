using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;
using Portfolio.Api.Features.About;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.LeetCode;

namespace Portfolio.Api.Features.Resume;

/// <summary>
/// The résumé generated from the About Me page. Generating makes two PDFs, stored until the next
/// time: one without the phone number, which the page's "Download résumé" button serves to
/// everyone, and one with it, for the admin only.
/// </summary>
public static class ResumeEndpoints
{
    /// <summary>The public PDF's address, put in the About Me page's résumé link (with ?v= so browsers fetch a new one).</summary>
    public const string PublicPath = "/api/resume";

    private static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;

    public static IEndpointRouteBuilder MapResumeEndpoints(this IEndpointRouteBuilder app)
    {
        var resume = app.MapGroup("/resume");

        resume.MapGet("/", GetPublicPdf).WithName("GetResume");

        resume.MapGet("/private", GetPrivatePdf).WithName("GetPrivateResume").RequireAuthorization();
        resume.MapGet("/settings", GetSettings).WithName("GetResumeSettings").RequireAuthorization();
        resume.MapPut("/settings", SaveSettings).WithName("SaveResumeSettings").RequireAuthorization();
        resume.MapPost("/generate", Generate).WithName("GenerateResume").RequireAuthorization();

        return app;
    }

    /// <summary>Public. The last generated résumé without the phone number; 404 before the first.</summary>
    /// <param name="inline">True opens it in the browser instead of downloading it.</param>
    public static async Task<Results<FileContentHttpResult, NotFound>> GetPublicPdf(PortfolioDbContext db, HttpContext http, CancellationToken cancellationToken, bool inline = false)
    {
        var row = await db.ResumeSettings.AsNoTracking()
            .Where(r => r.Id == ResumeSettings.SingletonId && r.PublicPdf != null)
            .Select(r => new { r.PublicPdf, r.GeneratedAt })
            .FirstOrDefaultAsync(cancellationToken);
        if (row is null) return TypedResults.NotFound();

        // The link changes (?v=) with every generation, so a short cache is safe.
        http.Response.Headers.CacheControl = "public, max-age=300";
        return Pdf(http, row.PublicPdf!, inline, row.GeneratedAt);
    }

    /// <summary>Admin only. The same résumé with the phone number.</summary>
    public static async Task<Results<FileContentHttpResult, NotFound>> GetPrivatePdf(PortfolioDbContext db, HttpContext http, CancellationToken cancellationToken, bool inline = false)
    {
        var row = await db.ResumeSettings.AsNoTracking()
            .Where(r => r.Id == ResumeSettings.SingletonId && r.PrivatePdf != null)
            .Select(r => new { r.PrivatePdf, r.GeneratedAt })
            .FirstOrDefaultAsync(cancellationToken);
        if (row is null) return TypedResults.NotFound();

        http.Response.Headers.CacheControl = "private, no-store";
        return Pdf(http, row.PrivatePdf!, inline, row.GeneratedAt);
    }

    /// <summary>Admin only. Defaults (<see cref="ResumeSections.Defaults"/>) until the first save.</summary>
    public static async Task<Ok<ResumeSettingsDto>> GetSettings(PortfolioDbContext db, HttpContext http, CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "private, no-store";
        var row = await db.ResumeSettings.AsNoTracking().FirstOrDefaultAsync(r => r.Id == ResumeSettings.SingletonId, cancellationToken);
        return TypedResults.Ok(ToDto(row));
    }

    /// <summary>Admin only. Saves the choices without generating.</summary>
    public static async Task<Results<Ok<ResumeSettingsDto>, ValidationProblem>> SaveSettings(
        ResumeSettingsRequest request,
        PortfolioDbContext db,
        CancellationToken cancellationToken)
    {
        var errors = ResumeRules.Validate(request);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var row = await SaveAsync(db, ResumeRules.Normalize(request), cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(ToDto(row));
    }

    /// <summary>
    /// Admin only. Saves the choices, makes both PDFs from the About Me page as it is now, and
    /// points the page's "Download résumé" button at the public one.
    /// </summary>
    public static async Task<Results<Ok<ResumeSettingsDto>, ValidationProblem>> Generate(
        ResumeSettingsRequest request,
        PortfolioDbContext db,
        LeetCodeStatsService leetCode,
        IOptions<SiteOptions> site,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var errors = ResumeRules.Validate(request);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var settings = ResumeRules.Normalize(request);
        var about = await AboutEndpoints.LoadAsync(db, cancellationToken);
        LeetCodeStats? stats = null;
        if (settings.Sections!.Contains(ResumeSections.ProblemSolving) && about.ProblemSolving.LeetCodeUsername.Length > 0)
        {
            stats = (await leetCode.GetAsync(about.ProblemSolving.LeetCodeUsername, cancellationToken)).Stats;
        }

        var now = time.GetUtcNow();
        var today = DateOnly.FromDateTime(now.UtcDateTime);
        var siteUrl = site.Value.PublicUrl.TrimEnd('/');
        var input = new ResumeInput(about, settings, stats, IncludePhone: false, today, siteUrl);

        var row = await SaveAsync(db, settings, cancellationToken);
        row.PublicPdf = ResumeDocument.Build(input);
        row.PrivatePdf = ResumeDocument.Build(input with { IncludePhone = true });
        row.GeneratedAt = now;

        // Visitors' "Download résumé" now gets this one (replacing an uploaded PDF, if there was one).
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

    private static async Task<ResumeSettings> SaveAsync(PortfolioDbContext db, ResumeSettingsRequest settings, CancellationToken cancellationToken)
    {
        var row = await db.ResumeSettings.FindAsync([ResumeSettings.SingletonId], cancellationToken);
        if (row is null)
        {
            row = new ResumeSettings { Id = ResumeSettings.SingletonId };
            db.ResumeSettings.Add(row);
        }
        row.Phone = settings.Phone!;
        row.Email = settings.Email!;
        row.Headline = settings.Headline!;
        row.Location = settings.Location!;
        row.Summary = settings.Summary!;
        row.Sections = JsonSerializer.Serialize(settings.Sections, Json);
        return row;
    }

    private static ResumeSettingsDto ToDto(ResumeSettings? row) => row is null
        ? new ResumeSettingsDto("", "", "", "", "", ResumeSections.Defaults, null)
        : new ResumeSettingsDto(row.Phone, row.Email, row.Headline, row.Location, row.Summary, JsonSerializer.Deserialize<string[]>(row.Sections, Json) ?? [], row.GeneratedAt);

    private static FileContentHttpResult Pdf(HttpContext http, byte[] pdf, bool inline, DateTimeOffset? generatedAt)
    {
        http.Response.Headers.ContentDisposition = new System.Net.Mime.ContentDisposition { Inline = inline, FileName = ResumeDocument.FileName }.ToString();
        http.Response.Headers.XContentTypeOptions = "nosniff";
        return TypedResults.File(pdf, "application/pdf", lastModified: generatedAt);
    }
}
