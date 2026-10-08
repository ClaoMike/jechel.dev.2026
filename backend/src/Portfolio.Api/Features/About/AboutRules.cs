namespace Portfolio.Api.Features.About;

/// <summary>
/// Validation and normalisation of the About Me page. Error keys are the JSON paths of the
/// fields, e.g. "experience[0].title", so the editor can show them next to the right input.
/// </summary>
public static class AboutRules
{
    public const int UrlMaxLength = 2048;
    public const int ShortTextMaxLength = 150;
    public const int BulletMaxLength = 500;
    public const int EntryMaxLength = 1000;
    public const int MaxSkills = 30;
    public const int MaxItems = 50;
    public const int MaxBullets = 20;

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

        if (CheckList(content.Skills, "skills", MaxSkills, Add))
        {
            for (var i = 0; i < content.Skills.Count; i++)
            {
                var skill = content.Skills[i];
                var key = $"skills[{i}]";
                if (skill is null) { Add(key, "Skill is required."); continue; }
                CheckText(skill.Name, $"{key}.name", ShortTextMaxLength, Add);
                if (skill.Level is < 0 or > 100) Add($"{key}.level", "Level must be between 0 and 100.");
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

        CheckBullets(content.Papers, "papers", MaxItems, EntryMaxLength, Add);
        CheckBullets(content.Qualifications, "qualifications", MaxItems, EntryMaxLength, Add);

        return errors;
    }

    /// <summary>
    /// Trims text, drops empty bullets, moves dates to the 1st of the month, and orders
    /// experience and education newest first (ongoing before ended, for the same start).
    /// Call only on content that passed <see cref="Validate"/>.
    /// </summary>
    public static AboutContent Normalize(AboutContent content) => new(
        content.PhotoUrl?.Trim() ?? "",
        new AboutLinks(
            content.Links.ResumeUrl?.Trim() ?? "",
            content.Links.GitHubUrl?.Trim() ?? "",
            content.Links.LinkedInUrl?.Trim() ?? "",
            content.Links.InstagramUrl?.Trim() ?? ""),
        [.. content.Skills.Select(s => s with { Name = s.Name.Trim() })],
        [.. content.Experience
            .Select(e => new ExperienceItem(e.Title.Trim(), e.Company.Trim(), e.Location?.Trim() ?? "", FirstOfMonth(e.Start), FirstOfMonth(e.End), CleanBullets(e.Bullets)))
            .OrderByDescending(e => e.Start)
            .ThenByDescending(e => e.End ?? DateOnly.MaxValue)],
        [.. content.Education
            .Select(e => new EducationItem(e.Title.Trim(), e.Institution.Trim(), e.Location?.Trim() ?? "", FirstOfMonth(e.Start), FirstOfMonth(e.End)))
            .OrderByDescending(e => e.Start)
            .ThenByDescending(e => e.End ?? DateOnly.MaxValue)],
        CleanBullets(content.Papers),
        CleanBullets(content.Qualifications));

    /// <summary>Empty, an http(s) URL, or a path on this site ("/resume.pdf"). Nothing else, so no javascript: links.</summary>
    public static bool IsSafeUrl(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return true;
        var url = value.Trim();
        if (url.StartsWith('/')) return !url.StartsWith("//") && !url.StartsWith("/\\");
        return Uri.TryCreate(url, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp);
    }

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
            if (bullets[i] is { } bullet && bullet.Trim().Length > maxLength) add($"{key}[{i}]", $"Must be at most {maxLength} characters.");
        }
    }

    private static void CheckPeriod(DateOnly start, DateOnly? end, string key, Action<string, string> add)
    {
        if (start == default) add($"{key}.start", "Start date is required.");
        else if (end is { } endDate && FirstOfMonth(endDate) < FirstOfMonth(start)) add($"{key}.end", "End must not be before the start.");
    }

    private static DateOnly FirstOfMonth(DateOnly date) => new(date.Year, date.Month, 1);
    private static DateOnly? FirstOfMonth(DateOnly? date) => date is { } d ? FirstOfMonth(d) : null;

    private static string[] CleanBullets(IReadOnlyList<string>? bullets) =>
        [.. (bullets ?? []).Select(b => b?.Trim() ?? "").Where(b => b.Length > 0)];
}
