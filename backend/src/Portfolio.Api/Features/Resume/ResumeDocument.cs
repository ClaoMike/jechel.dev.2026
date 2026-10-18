using System.Globalization;
using Portfolio.Api.Features.About;
using Portfolio.Api.Features.LeetCode;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Portfolio.Api.Features.Resume;

/// <summary>What a résumé is made from.</summary>
/// <param name="Settings">Normalized (<see cref="ResumeRules.Normalize"/>).</param>
/// <param name="LeetCode">The saved stats, for the "Problem solving" section; null leaves them out.</param>
/// <param name="IncludePhone">True only for the admin's copy.</param>
/// <param name="SiteUrl">The site's public address, e.g. "https://jechel.dev": paths in links are made absolute with it.</param>
public record ResumeInput(AboutContent About, ResumeSettingsRequest Settings, LeetCodeStats? LeetCode, bool IncludePhone, DateOnly Today, string SiteUrl);

/// <summary>
/// Lays the About Me page out as a one- or two-page A4 résumé (QuestPDF). Sections come in a fixed,
/// recruiter-friendly order (<see cref="ResumeSections.All"/>); empty ones are left out.
/// </summary>
public static class ResumeDocument
{
    public const string Name = "Claudiu Mihai Jechel";
    public const string FileName = "Claudiu Mihai Jechel CV.pdf";

    private const string Accent = "#1a5fb4";
    private static readonly string Muted = Colors.Grey.Darken1;

    static ResumeDocument()
    {
        // Free for individuals and companies under $1M revenue (QuestPDF's Community licence).
        QuestPDF.Settings.License = LicenseType.Community;
    }

    public static byte[] Build(ResumeInput input)
    {
        var settings = input.Settings;
        bool Has(string section) => settings.Sections!.Contains(section);

        return Document.Create(document => document.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.MarginHorizontal(42);
                page.MarginVertical(36);
                page.DefaultTextStyle(style => style.FontSize(9.5f).LineHeight(1.3f).FontColor(Colors.Grey.Darken4));

                page.Header().Element(header => Header(header, input, Has(ResumeSections.Statuses), Has(ResumeSections.Links)));

                page.Content().PaddingTop(10).Column(column =>
                {
                    column.Spacing(10);
                    var about = input.About;
                    if (Has(ResumeSections.Summary) && settings.Summary!.Length > 0)
                        Section(column, "Profile", body => body.Item().Text(text => Rich(text, settings.Summary, input.SiteUrl)));
                    if (Has(ResumeSections.Experience) && about.Experience.Count > 0)
                        Section(column, "Experience", body => { foreach (var item in about.Experience) Experience(body, item, input); });
                    if (Has(ResumeSections.Skills) && about.Skills.Count > 0)
                        Section(column, "Skills", body => body.Item().Text(SkillsLine(about.Skills, input.Today)));
                    if (Has(ResumeSections.Education) && about.Education.Count > 0)
                        Section(column, "Education", body => { foreach (var item in about.Education) Education(body, item, input); });
                    if (Has(ResumeSections.Qualifications) && about.Qualifications.Count > 0)
                        Section(column, "Qualifications", body => { foreach (var item in about.Qualifications) Qualification(body, item, input); });
                    if (Has(ResumeSections.Papers) && about.Papers.Count > 0)
                        Section(column, "Publications", body => { foreach (var paper in about.Papers) Paper(body, paper, input); });
                    if (Has(ResumeSections.Hackathons) && about.Hackathons.Count > 0)
                        Section(column, "Hackathons", body => { foreach (var item in about.Hackathons) Hackathon(body, item, input); });
                    if (Has(ResumeSections.ProblemSolving) && ProblemSolvingLine(about.ProblemSolving, input.LeetCode) is { } problemSolving)
                        Section(column, "Problem solving", body => body.Item().Text(problemSolving));
                    if (Has(ResumeSections.Languages) && about.Languages.Count > 0)
                        Section(column, "Languages", body => body.Item().Text(string.Join(" · ", about.Languages.Select(l => $"{l.Name} ({l.Level})"))));
                    if (Has(ResumeSections.Licences) && about.Licences.Count > 0)
                        Section(column, "Licences", body => body.Item().Text(LicencesLine(about.Licences)));
                    if (Has(ResumeSections.Places) && PlacesLines(about.Places) is { Count: > 0 } places)
                        Section(column, "Places", body => { foreach (var line in places) body.Item().Text(line); });
                });

                page.Footer().AlignRight().Text(text =>
                {
                    text.DefaultTextStyle(style => style.FontSize(8).FontColor(Muted));
                    text.CurrentPageNumber();
                    text.Span(" / ");
                    text.TotalPages();
                });
            }))
            .WithMetadata(new DocumentMetadata { Title = $"{Name} CV", Author = Name, Subject = "Curriculum vitae", CreationDate = input.Today.ToDateTime(TimeOnly.MinValue) })
            .GeneratePdf();
    }

    private static void Header(IContainer container, ResumeInput input, bool statuses, bool links)
    {
        var settings = input.Settings;
        container.Column(column =>
        {
            column.Spacing(2);
            column.Item().Text(Name).FontSize(22).Bold().FontColor(Colors.Grey.Darken4);
            if (settings.Headline!.Length > 0) column.Item().Text(settings.Headline).FontSize(11).FontColor(Accent);

            column.Item().PaddingTop(2).Text(text =>
            {
                text.DefaultTextStyle(style => style.FontColor(Muted));
                var first = true;
                void Separator()
                {
                    if (!first) text.Span("  ·  ");
                    first = false;
                }

                if (settings.Location!.Length > 0) { Separator(); text.Span(settings.Location); }
                if (settings.Email!.Length > 0) { Separator(); text.Hyperlink(settings.Email, $"mailto:{settings.Email}"); }
                if (input.IncludePhone && settings.Phone!.Length > 0) { Separator(); text.Hyperlink(settings.Phone, $"tel:{settings.Phone.Replace(" ", "")}"); }
                if (links)
                {
                    foreach (var (label, url) in Links(input))
                    {
                        Separator();
                        text.Hyperlink(label, url).FontColor(Accent);
                    }
                }
            });

            if (statuses && input.About.Statuses.Count > 0)
            {
                column.Item().Text(text =>
                {
                    text.DefaultTextStyle(style => style.FontColor(Muted));
                    for (var i = 0; i < input.About.Statuses.Count; i++)
                    {
                        if (i > 0) text.Span("  ·  ");
                        Rich(text, input.About.Statuses[i].Text, input.SiteUrl);
                    }
                });
            }
            column.Item().PaddingTop(6).LineHorizontal(1).LineColor(Accent);
        });
    }

    /// <summary>The site, GitHub and LinkedIn, shown by their address without "https://www.".</summary>
    private static IEnumerable<(string Label, string Url)> Links(ResumeInput input)
    {
        string[] urls = [input.SiteUrl, input.About.Links.GitHubUrl, input.About.Links.LinkedInUrl];
        foreach (var url in urls)
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme is not ("https" or "http")) continue;
            // A bare "https://github.com/" placeholder isn't a profile.
            if (uri.AbsolutePath.Trim('/').Length == 0 && url != input.SiteUrl) continue;
            var label = (uri.Host.StartsWith("www.") ? uri.Host[4..] : uri.Host) + uri.AbsolutePath.TrimEnd('/');
            yield return (label, url);
        }
    }

    private static void Section(ColumnDescriptor column, string title, Action<ColumnDescriptor> body)
    {
        column.Item().Column(section =>
        {
            section.Spacing(5);
            // A heading never ends a page on its own.
            section.Item().EnsureSpace(60).Column(heading =>
            {
                heading.Item().Text(title.ToUpperInvariant()).FontSize(10).Bold().LetterSpacing(0.06f).FontColor(Accent);
                heading.Item().PaddingTop(1).LineHorizontal(0.5f).LineColor(Colors.Grey.Lighten2);
            });
            body(section);
        });
    }

    private static void Experience(ColumnDescriptor column, ExperienceItem item, ResumeInput input) =>
        column.Item().EnsureSpace(50).Column(entry =>
        {
            entry.Spacing(1);
            entry.Item().Row(row =>
            {
                row.RelativeItem().Text(text =>
                {
                    Rich(text, item.Title, input.SiteUrl, bold: true);
                    text.Span("  ·  ").FontColor(Muted);
                    Rich(text, item.Company, input.SiteUrl);
                });
                row.AutoItem().PaddingLeft(8).Text(Dates(item.Start, item.End)).FontColor(Muted);
            });
            if (item.Location.Length > 0) entry.Item().Text(item.Location).FontSize(8.5f).FontColor(Muted);
            foreach (var bullet in item.Bullets) Bullet(entry, bullet, input);
        });

    private static void Education(ColumnDescriptor column, EducationItem item, ResumeInput input) =>
        column.Item().EnsureSpace(30).Row(row =>
        {
            row.RelativeItem().Text(text =>
            {
                Rich(text, item.Title, input.SiteUrl, bold: true);
                text.Span("  ·  ").FontColor(Muted);
                Rich(text, item.Institution, input.SiteUrl);
                if (item.Location.Length > 0) text.Span($", {item.Location}").FontColor(Muted);
            });
            row.AutoItem().PaddingLeft(8).Text(Dates(item.Start, item.End)).FontColor(Muted);
        });

    private static void Qualification(ColumnDescriptor column, Qualification item, ResumeInput input) =>
        column.Item().Row(row =>
        {
            row.RelativeItem().Text(text =>
            {
                Rich(text, item.Title, input.SiteUrl, bold: true);
                if (item.Issuer.Length > 0)
                {
                    text.Span("  ·  ").FontColor(Muted);
                    Rich(text, item.Issuer, input.SiteUrl);
                }
                if (item.Grade.Length > 0) text.Span($"  ·  {item.Grade}").FontColor(Muted);
            });
            if (item.Obtained is { } obtained) row.AutoItem().PaddingLeft(8).Text(Month(obtained)).FontColor(Muted);
        });

    private static void Paper(ColumnDescriptor column, Paper paper, ResumeInput input)
    {
        if (paper.FileUrl.Length > 0 && AboutRules.IsSafeUrl(paper.FileUrl))
        {
            column.Item().Text(text => text.Hyperlink(PlainText(paper.Title), Absolute(paper.FileUrl, input.SiteUrl)));
        }
        else
        {
            column.Item().Text(text => Rich(text, paper.Title, input.SiteUrl));
        }
    }

    private static void Hackathon(ColumnDescriptor column, Hackathon item, ResumeInput input) =>
        column.Item().EnsureSpace(40).Column(entry =>
        {
            entry.Spacing(1);
            entry.Item().Row(row =>
            {
                row.RelativeItem().Text(text => Rich(text, item.Name, input.SiteUrl, bold: true));
                row.AutoItem().PaddingLeft(8).Text(item.Year.ToString(CultureInfo.InvariantCulture)).FontColor(Muted);
            });
            foreach (var bullet in item.Bullets) Bullet(entry, bullet, input);
        });

    private static void Bullet(ColumnDescriptor column, string text, ResumeInput input) =>
        column.Item().PaddingLeft(4).Row(row =>
        {
            row.ConstantItem(10).Text("•").FontColor(Accent);
            row.RelativeItem().Text(line => Rich(line, text, input.SiteUrl));
        });

    /// <summary>Text with [text](url) links, as hyperlinks.</summary>
    private static void Rich(TextDescriptor text, string value, string siteUrl, bool bold = false)
    {
        var position = 0;
        foreach (System.Text.RegularExpressions.Match match in AboutRules.MarkdownLinkPattern().Matches(value))
        {
            if (match.Index > position) Style(text.Span(value[position..match.Index]), bold);
            var url = match.Groups[2].Value;
            var label = match.Groups[1].Value;
            if (AboutRules.IsSafeUrl(url)) Style(text.Hyperlink(label, Absolute(url, siteUrl)), bold);
            else Style(text.Span(label), bold);
            position = match.Index + match.Length;
        }
        if (position < value.Length) Style(text.Span(value[position..]), bold);
    }

    private static void Style(TextSpanDescriptor span, bool bold)
    {
        if (bold) span.SemiBold();
    }

    /// <summary>Plain text: [text](url) becomes text.</summary>
    private static string PlainText(string value) => AboutRules.MarkdownLinkPattern().Replace(value, "$1");

    private static string Absolute(string url, string siteUrl) => url.StartsWith('/') ? siteUrl.TrimEnd('/') + url : url;

    public static string Month(DateOnly date) => date.ToString("MMM yyyy", CultureInfo.InvariantCulture);

    public static string Dates(DateOnly start, DateOnly? end) => $"{Month(start)} – {(end is { } e ? Month(e) : "Present")}";

    /// <summary>"C# (7 years), TypeScript (5 years), Docker": in the page's order, with the experience worked out like the page does.</summary>
    public static string SkillsLine(IReadOnlyList<Skill> skills, DateOnly today) =>
        string.Join(", ", skills.Select(s => MonthsUsed(s, today) is var months and > 0 ? $"{PlainText(s.Name)} ({Experience(months)})" : PlainText(s.Name)));

    /// <summary>Months used up to now; overlapping periods count once, the future doesn't count. Same as the frontend's skills.ts.</summary>
    public static int MonthsUsed(Skill skill, DateOnly today)
    {
        static int Index(DateOnly d) => d.Year * 12 + d.Month - 1;
        var nowEnd = Index(today) + 1;
        var spans = skill.Periods
            .Select(p => (Start: Index(p.Start), End: Math.Min(Index(p.End ?? today) + 1, nowEnd)))
            .Where(s => s.End > s.Start)
            .OrderBy(s => s.Start);
        var total = 0;
        var coveredUntil = int.MinValue;
        foreach (var (start, end) in spans)
        {
            var from = Math.Max(start, coveredUntil);
            if (end > from) total += end - from;
            coveredUntil = Math.Max(coveredUntil, end);
        }
        return total;
    }

    /// <summary>"3 months", "1 year", "6 years". Same as the frontend's formatExperience.</summary>
    public static string Experience(int months)
    {
        if (months < 12) return months == 1 ? "1 month" : $"{months} months";
        var years = (int)Math.Round(months / 12.0, MidpointRounding.AwayFromZero);
        return years == 1 ? "1 year" : $"{years} years";
    }

    private static readonly Dictionary<string, string> NeetCodeNames = new()
    {
        [NeetCodeListIds.Blind75] = "Blind 75",
        [NeetCodeListIds.NeetCode150] = "NeetCode 150",
        [NeetCodeListIds.NeetCode250] = "NeetCode 250",
    };

    /// <summary>Null when there's nothing to say.</summary>
    public static string? ProblemSolvingLine(ProblemSolving problemSolving, LeetCodeStats? leetCode)
    {
        var parts = new List<string>();
        if (leetCode is { } stats)
            parts.Add($"LeetCode: {stats.Solved.All} problems solved ({stats.Solved.Easy} easy, {stats.Solved.Medium} medium, {stats.Solved.Hard} hard)");
        if (problemSolving.NeetCodeLists.Count > 0)
            parts.Add($"NeetCode lists completed: {string.Join(", ", problemSolving.NeetCodeLists.Select(l => NeetCodeNames.GetValueOrDefault(l, l)))}");
        return parts.Count == 0 ? null : string.Join("  ·  ", parts);
    }

    /// <summary>"Driving: B (Car), A (Motorcycle)  ·  Flying: …".</summary>
    public static string LicencesLine(IReadOnlyList<Licence> licences) =>
        string.Join("  ·  ", licences
            .GroupBy(l => l.Category)
            .Select(g => $"{CultureInfo.InvariantCulture.TextInfo.ToTitleCase(g.Key)}: {string.Join(", ", g.Select(l => l.Code.Length > 0 ? $"{l.Code} ({l.Name})" : l.Name))}"));

    /// <summary>"Worked in: Manchester (United Kingdom), …", then studied, then visited.</summary>
    public static List<string> PlacesLines(IReadOnlyList<Place> places)
    {
        var lines = new List<string>();
        foreach (var (kind, label) in new[] { (PlaceVisitKinds.Worked, "Worked in"), (PlaceVisitKinds.Studied, "Studied in"), (PlaceVisitKinds.Visited, "Visited") })
        {
            var names = places.Where(p => p.Visits.Any(v => v.Kind == kind)).Select(p => $"{p.Name} ({p.Country})").ToList();
            if (names.Count > 0) lines.Add($"{label}: {string.Join(", ", names)}");
        }
        return lines;
    }
}
