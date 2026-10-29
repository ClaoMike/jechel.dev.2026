using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Resume;

/// <summary>
/// The résumé generated from the About Me page. Generating makes two PDFs, stored until the next
/// time: one without the email and phone number, which the page's "Download résumé" button serves
/// to everyone (so the email isn't picked up for spam), and one with them, for the admin only.
/// </summary>
public static class ResumeShared
{
    /// <summary>The public PDF's address, put in the About Me page's résumé link (with ?v= so browsers fetch a new one).</summary>
    public const string PublicPath = "/api/resume";

    internal static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;

    internal static async Task<ResumeSettings> RowAsync(PortfolioDbContext db, CancellationToken cancellationToken)
    {
        var row = await db.ResumeSettings.FindAsync([ResumeSettings.SingletonId], cancellationToken);
        if (row is null)
        {
            row = new ResumeSettings { Id = ResumeSettings.SingletonId, Sections = JsonSerializer.Serialize(ResumeSections.Defaults, Json) };
            db.ResumeSettings.Add(row);
        }
        return row;
    }

    internal static void SetChoices(ResumeSettings row, ResumeChoices choices)
    {
        row.Sections = JsonSerializer.Serialize(choices.Sections, Json);
        row.ExcludedSkills = JsonSerializer.Serialize(choices.ExcludedSkills ?? [], Json);
    }

    /// <summary>Sections an older version saved (e.g. "summary") are left out.</summary>
    internal static ResumeSettingsDto ToDto(ResumeSettings? row) => row is null
        ? new ResumeSettingsDto("", "", "", ResumeSections.Defaults, [], null)
        : new ResumeSettingsDto(row.Phone, row.Email, row.Headline,
            ResumeRules.Normalize(new ResumeChoices(JsonSerializer.Deserialize<string[]>(row.Sections, Json), null)).Sections!,
            JsonSerializer.Deserialize<string[]>(row.ExcludedSkills, Json) ?? [], row.GeneratedAt);

    internal static FileContentHttpResult Pdf(HttpContext http, byte[] pdf, bool inline, DateTimeOffset? generatedAt)
    {
        http.Response.Headers.ContentDisposition = new System.Net.Mime.ContentDisposition { Inline = inline, FileName = ResumeDocument.FileName }.ToString();
        http.Response.Headers.XContentTypeOptions = "nosniff";
        return TypedResults.File(pdf, "application/pdf", lastModified: generatedAt);
    }
}
