using System.Text.RegularExpressions;

namespace Portfolio.Api.Features.About;

/// <summary>
/// Validation and normalisation of the About Me page. Error keys are the JSON paths of the
/// fields, e.g. "experience[0].title", so the editor can show them next to the right input.
/// </summary>
public static partial class AboutRules
{
    public const int UrlMaxLength = 2048;
    public const int ShortTextMaxLength = 300;
    public const int BulletMaxLength = 1000;
    public const int EntryMaxLength = 1500;
    public const int GradeMaxLength = 50;
    public const int MaxSkills = 30;
    public const int MaxSkillPeriods = 10;
    public const int MaxItems = 50;
    public const int MaxBullets = 20;
    public const int MaxPlaces = 500;
    public const int MaxStatuses = 10;
    public const int CodeMaxLength = 20;

    public static Dictionary<string, string[]> Validate(AboutContent? content)
    {
        var errors = new Dictionary<string, string[]>();
        void Add(string key, string message) => errors[key] = [message];

        if (content is null)
        {
            Add("", "The page content is required.");
            return errors;
        }

        CheckUrl(content.PhotoUrl, "photoUrl", Add);
        if (CheckList(content.Statuses, "statuses", MaxStatuses, Add))
        {
            for (var i = 0; i < content.Statuses.Count; i++)
            {
                var status = content.Statuses[i];
                if (status is null) { Add($"statuses[{i}]", "Label is required."); continue; }
                CheckText(status.Text, $"statuses[{i}].text", ShortTextMaxLength, Add);
                if (status.Flag is null || !FlagCode().IsMatch(status.Flag)) Add($"statuses[{i}].flag", "Must be a two-letter country code, EU, or empty.");
            }
        }
        if (content.Links is null)
        {
            Add("links", "Links are required.");
        }
        else
        {
            CheckUrl(content.Links.ResumeUrl, "links.resumeUrl", Add);
            CheckUrl(content.Links.GitHubUrl, "links.gitHubUrl", Add);
            CheckUrl(content.Links.LinkedInUrl, "links.linkedInUrl", Add);
            CheckUrl(content.Links.InstagramUrl, "links.instagramUrl", Add);
        }

        if (content.Colors is null)
        {
            Add("colors", "Colours are required.");
        }
        else
        {
            CheckColors(content.Colors.Skills, SkillUses.All, "colors.skills", Add);
            CheckColors(content.Colors.Places, PlaceVisitKinds.All, "colors.places", Add);
        }

        if (CheckList(content.Places, "places", MaxPlaces, Add))
        {
            for (var i = 0; i < content.Places.Count; i++)
            {
                var place = content.Places[i];
                var key = $"places[{i}]";
                if (place is null) { Add(key, "Place is required."); continue; }
                CheckText(place.Name, $"{key}.name", ShortTextMaxLength, Add);
                CheckText(place.Region, $"{key}.region", ShortTextMaxLength, Add, required: false);
                CheckText(place.Country, $"{key}.country", ShortTextMaxLength, Add, required: false);
                if (place.Latitude is < -90 or > 90 || place.Longitude is < -180 or > 180 || double.IsNaN(place.Latitude) || double.IsNaN(place.Longitude))
                {
                    Add($"{key}.latitude", "Not a position on Earth.");
                }
                if (place.Visits is null || place.Visits.Count == 0)
                {
                    Add($"{key}.visits", "Tick at least one: worked, studied or visited.");
                    continue;
                }
                CheckKinds(place.Visits.Select(v => v?.Kind), PlaceVisitKinds.All, $"{key}.visits", Add);
                for (var v = 0; v < place.Visits.Count; v++)
                {
                    CheckText(place.Visits[v]?.Note, $"{key}.visits[{v}].note", BulletMaxLength, Add, required: false);
                }
            }
        }

        if (CheckList(content.Skills, "skills", MaxSkills, Add))
        {
            for (var i = 0; i < content.Skills.Count; i++)
            {
                var skill = content.Skills[i];
                var key = $"skills[{i}]";
                if (skill is null) { Add(key, "Skill is required."); continue; }
                CheckText(skill.Name, $"{key}.name", ShortTextMaxLength, Add);
                if (skill.Periods is null) { Add($"{key}.periods", "Required (can be empty)."); continue; }
                if (skill.Periods.Count > MaxSkillPeriods) { Add($"{key}.periods", $"At most {MaxSkillPeriods} periods."); continue; }
                for (var p = 0; p < skill.Periods.Count; p++)
                {
                    var period = skill.Periods[p];
                    var periodKey = $"{key}.periods[{p}]";
                    if (period is null) { Add(periodKey, "Period is required."); continue; }
                    CheckPeriod(period.Start, period.End, periodKey, Add);
                    if (period.Uses is null || period.Uses.Count == 0) Add($"{periodKey}.uses", "Tick at least one: work, academic or personal.");
                    else CheckKinds(period.Uses, SkillUses.All, $"{periodKey}.uses", Add);
                }
            }
        }

        if (CheckList(content.Experience, "experience", MaxItems, Add))
        {
            for (var i = 0; i < content.Experience.Count; i++)
            {
                var item = content.Experience[i];
                var key = $"experience[{i}]";
                if (item is null) { Add(key, "Experience is required."); continue; }
                CheckText(item.Title, $"{key}.title", ShortTextMaxLength, Add);
                CheckText(item.Company, $"{key}.company", ShortTextMaxLength, Add);
                CheckText(item.Location, $"{key}.location", ShortTextMaxLength, Add, required: false);
                CheckPeriod(item.Start, item.End, key, Add);
                CheckBullets(item.Bullets, $"{key}.bullets", MaxBullets, BulletMaxLength, Add);
            }
        }

        if (CheckList(content.Education, "education", MaxItems, Add))
        {
            for (var i = 0; i < content.Education.Count; i++)
            {
                var item = content.Education[i];
                var key = $"education[{i}]";
                if (item is null) { Add(key, "Education is required."); continue; }
                CheckText(item.Title, $"{key}.title", ShortTextMaxLength, Add);
                CheckText(item.Institution, $"{key}.institution", ShortTextMaxLength, Add);
                CheckText(item.Location, $"{key}.location", ShortTextMaxLength, Add, required: false);
                CheckPeriod(item.Start, item.End, key, Add);
            }
        }

        if (CheckList(content.Papers, "papers", MaxItems, Add))
        {
            for (var i = 0; i < content.Papers.Count; i++)
            {
                var paper = content.Papers[i];
                if (paper is null) { Add($"papers[{i}]", "Paper is required."); continue; }
                CheckText(paper.Title, $"papers[{i}].title", EntryMaxLength, Add);
                CheckUrl(paper.FileUrl, $"papers[{i}].fileUrl", Add);
            }
        }

        if (CheckList(content.Qualifications, "qualifications", MaxItems, Add))
        {
            for (var i = 0; i < content.Qualifications.Count; i++)
            {
                var item = content.Qualifications[i];
                var key = $"qualifications[{i}]";
                if (item is null) { Add(key, "Qualification is required."); continue; }
                CheckText(item.Title, $"{key}.title", EntryMaxLength, Add);
                CheckText(item.Issuer, $"{key}.issuer", ShortTextMaxLength, Add, required: false);
                CheckText(item.Grade, $"{key}.grade", GradeMaxLength, Add, required: false);
                if (item.Obtained == default(DateOnly)) Add($"{key}.obtained", "Not a valid date.");
            }
        }

        if (CheckList(content.Languages, "languages", MaxItems, Add))
        {
            for (var i = 0; i < content.Languages.Count; i++)
            {
                var language = content.Languages[i];
                if (language is null) { Add($"languages[{i}]", "Language is required."); continue; }
                CheckText(language.Name, $"languages[{i}].name", ShortTextMaxLength, Add);
                if (language.Level is null || !LanguageLevels.All.Contains(language.Level)) Add($"languages[{i}].level", $"Must be one of: {string.Join(", ", LanguageLevels.All)}.");
            }
        }

        if (CheckList(content.Licences, "licences", MaxItems, Add))
        {
            for (var i = 0; i < content.Licences.Count; i++)
            {
                var licence = content.Licences[i];
                if (licence is null) { Add($"licences[{i}]", "Licence is required."); continue; }
                if (licence.Category is null || !LicenceCategories.All.Contains(licence.Category)) Add($"licences[{i}].category", $"Must be one of: {string.Join(", ", LicenceCategories.All)}.");
                CheckText(licence.Code, $"licences[{i}].code", CodeMaxLength, Add, required: false);
                CheckText(licence.Name, $"licences[{i}].name", ShortTextMaxLength, Add);
            }
        }

        if (CheckList(content.Hackathons, "hackathons", MaxItems, Add))
        {
            for (var i = 0; i < content.Hackathons.Count; i++)
            {
                var hackathon = content.Hackathons[i];
                if (hackathon is null) { Add($"hackathons[{i}]", "Hackathon is required."); continue; }
                CheckText(hackathon.Name, $"hackathons[{i}].name", ShortTextMaxLength, Add);
                if (hackathon.Year is < 1950 or > 2200) Add($"hackathons[{i}].year", "Enter a year like 2024.");
                CheckBullets(hackathon.Bullets, $"hackathons[{i}].bullets", MaxBullets, BulletMaxLength, Add);
            }
        }

        return errors;
    }

    /// <summary>
    /// Trims text, drops empty bullets, moves dates to the 1st of the month and lower-cases the
    /// colours. Keeps every list in the order the admin chose. Call only on content that passed
    /// <see cref="Validate"/>.
    /// </summary>
    public static AboutContent Normalize(AboutContent content) => new(
        Trim(content.PhotoUrl),
        [.. content.Statuses.Select(s => new Status(s.Text.Trim(), s.Flag.ToUpperInvariant()))],
        new AboutLinks(Trim(content.Links.ResumeUrl), Trim(content.Links.GitHubUrl), Trim(content.Links.LinkedInUrl), Trim(content.Links.InstagramUrl)),
        new AboutColors(NormalizeColors(content.Colors.Skills, SkillUses.All), NormalizeColors(content.Colors.Places, PlaceVisitKinds.All)),
        [.. content.Places.Select(p => p with
        {
            Name = p.Name.Trim(),
            Region = Trim(p.Region),
            Country = Trim(p.Country),
            // Always in legend order, so a city's dot is split the same way everywhere.
            Visits = [.. p.Visits.OrderBy(v => IndexIn(PlaceVisitKinds.All, v.Kind)).Select(v => new PlaceVisit(v.Kind, Trim(v.Note)))],
        })],
        [.. content.Skills.Select(s => new Skill(
            s.Name.Trim(),
            [.. s.Periods.Select(p => new SkillPeriod(FirstOfMonth(p.Start), FirstOfMonth(p.End), [.. p.Uses.OrderBy(u => IndexIn(SkillUses.All, u))]))]))],
        [.. content.Experience.Select(e => new ExperienceItem(e.Title.Trim(), e.Company.Trim(), Trim(e.Location), FirstOfMonth(e.Start), FirstOfMonth(e.End), CleanBullets(e.Bullets)))],
        [.. content.Education.Select(e => new EducationItem(e.Title.Trim(), e.Institution.Trim(), Trim(e.Location), FirstOfMonth(e.Start), FirstOfMonth(e.End)))],
        [.. content.Papers.Select(p => new Paper(p.Title.Trim(), Trim(p.FileUrl)))],
        [.. content.Qualifications.Select(q => new Qualification(q.Title.Trim(), Trim(q.Issuer), FirstOfMonth(q.Obtained), Trim(q.Grade)))],
        [.. content.Languages.Select(l => new Language(l.Name.Trim(), l.Level))],
        [.. content.Licences.Select(l => new Licence(l.Category, Trim(l.Code), l.Name.Trim()))],
        [.. content.Hackathons.Select(h => new Hackathon(h.Name.Trim(), h.Year, CleanBullets(h.Bullets)))]);

    /// <summary>Empty, an http(s) URL, or a path on this site ("/resume.pdf"). Nothing else, so no javascript: links.</summary>
    public static bool IsSafeUrl(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return true;
        var url = value.Trim();
        if (url.StartsWith('/')) return !url.StartsWith("//") && !url.StartsWith("/\\");
        return Uri.TryCreate(url, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp);
    }

    /// <summary>The URLs of the [text](url) links in a piece of text. Same syntax as the frontend's textLinks.ts.</summary>
    public static IEnumerable<string> LinksIn(string text) => MarkdownLink().Matches(text).Select(m => m.Groups[2].Value);

    private static void CheckUrl(string? value, string key, Action<string, string> add)
    {
        if (value is not null && value.Length > UrlMaxLength) add(key, $"Must be at most {UrlMaxLength} characters.");
        else if (!IsSafeUrl(value)) add(key, "Must be an http(s) link, or a path on this site starting with /.");
    }

    private static void CheckText(string? value, string key, int maxLength, Action<string, string> add, bool required = true)
    {
        var text = value?.Trim() ?? "";
        if (required && text.Length == 0) add(key, "Required.");
        else if (text.Length > maxLength) add(key, $"Must be at most {maxLength} characters.");
        else if (LinksIn(text).Any(url => !IsSafeUrl(url) || url.Length > UrlMaxLength)) add(key, "Links must be http(s) links, or paths on this site starting with /.");
    }

    private static bool CheckList<T>(IReadOnlyList<T>? list, string key, int max, Action<string, string> add)
    {
        if (list is null) { add(key, "Required (can be empty)."); return false; }
        if (list.Count > max) { add(key, $"At most {max} items."); return false; }
        return true;
    }

    private static void CheckBullets(IReadOnlyList<string>? bullets, string key, int max, int maxLength, Action<string, string> add)
    {
        if (!CheckList(bullets, key, max, add)) return;
        for (var i = 0; i < bullets!.Count; i++)
        {
            CheckText(bullets[i], $"{key}[{i}]", maxLength, add, required: false);
        }
    }

    private static void CheckPeriod(DateOnly start, DateOnly? end, string key, Action<string, string> add)
    {
        if (start == default) add($"{key}.start", "Start date is required.");
        else if (end is { } endDate && FirstOfMonth(endDate) < FirstOfMonth(start)) add($"{key}.end", "End must not be before the start.");
    }

    /// <summary>Each value must be one of <paramref name="allowed"/>, at most once.</summary>
    private static void CheckKinds(IEnumerable<string?> values, IReadOnlyList<string> allowed, string key, Action<string, string> add)
    {
        var list = values.ToList();
        if (list.Any(v => v is null || !allowed.Contains(v))) add(key, $"Each must be one of: {string.Join(", ", allowed)}.");
        else if (list.Distinct().Count() != list.Count) add(key, "Each can be ticked only once.");
    }

    private static void CheckColors(IReadOnlyDictionary<string, string>? colors, IReadOnlyList<string> keys, string key, Action<string, string> add)
    {
        foreach (var name in keys)
        {
            if (colors is null || !colors.TryGetValue(name, out var color) || color is null || !HexColor().IsMatch(color)) add($"{key}.{name}", "Must be a colour like #1a73e8.");
        }
    }

    private static IReadOnlyDictionary<string, string> NormalizeColors(IReadOnlyDictionary<string, string> colors, IReadOnlyList<string> keys) =>
        keys.ToDictionary(k => k, k => colors[k].ToLowerInvariant());

    private static int IndexIn(IReadOnlyList<string> list, string value) => list.ToList().IndexOf(value);

    private static string Trim(string? value) => value?.Trim() ?? "";

    private static DateOnly FirstOfMonth(DateOnly date) => new(date.Year, date.Month, 1);
    private static DateOnly? FirstOfMonth(DateOnly? date) => date is { } d ? FirstOfMonth(d) : null;

    private static string[] CleanBullets(IReadOnlyList<string>? bullets) =>
        [.. (bullets ?? []).Select(b => b?.Trim() ?? "").Where(b => b.Length > 0)];

    [GeneratedRegex(@"\[([^\[\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)")]
    private static partial Regex MarkdownLink();

    [GeneratedRegex("^([A-Za-z]{2})?$")]
    private static partial Regex FlagCode();

    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex HexColor();
}
