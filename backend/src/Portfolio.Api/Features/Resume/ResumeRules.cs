using System.Text.RegularExpressions;
using Portfolio.Api.Features.Contact;

namespace Portfolio.Api.Features.Resume;

/// <summary>The parts of the About Me page a résumé can include, in the order they're printed.</summary>
public static class ResumeSections
{
    public const string Statuses = "statuses";
    public const string Links = "links";
    public const string Experience = "experience";
    public const string Skills = "skills";
    public const string Education = "education";
    public const string Qualifications = "qualifications";
    public const string Papers = "papers";
    public const string Hackathons = "hackathons";
    public const string ProblemSolving = "problemSolving";
    public const string Languages = "languages";
    public const string Licences = "licences";
    public const string Places = "places";

    public static readonly IReadOnlyList<string> All =
        [Statuses, Links, Experience, Skills, Education, Qualifications, Papers, Hackathons, ProblemSolving, Languages, Licences, Places];

    /// <summary>Until the admin chooses: what recruiters read; not the map, LeetCode or licences.</summary>
    public static readonly IReadOnlyList<string> Defaults =
        [Statuses, Links, Experience, Skills, Education, Qualifications, Papers, Hackathons, Languages];
}

/// <summary>The résumé's contact details, edited with the About Me profile. Only the headline is public (under the name on About Me).</summary>
/// <param name="Phone">Private: only in the admin's copy.</param>
/// <param name="Headline">Under the name, e.g. "Full-stack engineer · .NET, React, PostgreSQL".</param>
public record ResumeContact(string? Phone, string? Email, string? Headline);

/// <summary>The public part of <see cref="ResumeContact"/>.</summary>
public record ResumeHeadline(string Headline);

/// <summary>What the generator puts in.</summary>
/// <param name="Sections">Ids from <see cref="ResumeSections.All"/>; printed in that order, whatever the order here.</param>
/// <param name="ExcludedSkills">Names of the About Me skills to leave out; skills added later are in until left out.</param>
public record ResumeChoices(IReadOnlyList<string>? Sections, IReadOnlyList<string>? ExcludedSkills);

/// <summary>Everything the admin set for the résumé.</summary>
/// <param name="GeneratedAt">When the PDFs were last made; null before the first time.</param>
public record ResumeSettingsDto(string Phone, string Email, string Headline, IReadOnlyList<string> Sections, IReadOnlyList<string> ExcludedSkills, DateTimeOffset? GeneratedAt);

public static partial class ResumeRules
{
    public const int PhoneMaxLength = 30;
    public const int HeadlineMaxLength = 150;
    public const int MaxExcludedSkills = 200;

    public static Dictionary<string, string[]> Validate(ResumeContact contact)
    {
        var errors = new Dictionary<string, string[]>();
        var phone = contact.Phone?.Trim() ?? "";
        var email = contact.Email?.Trim() ?? "";

        if (phone.Length > PhoneMaxLength || !Phone().IsMatch(phone))
            errors["phone"] = [$"Use digits, spaces, + ( ) - and dots, at most {PhoneMaxLength} characters."];
        if (email.Length > 0 && (email.Length > ContactRules.EmailMaxLength || !ContactRules.IsEmail(email)))
            errors["email"] = ["Enter a valid email address, or leave it empty."];
        if ((contact.Headline?.Trim().Length ?? 0) > HeadlineMaxLength)
            errors["headline"] = [$"At most {HeadlineMaxLength} characters."];

        return errors;
    }

    public static Dictionary<string, string[]> Validate(ResumeChoices choices)
    {
        var errors = new Dictionary<string, string[]>();
        if (choices.Sections is null || choices.Sections.Any(s => !ResumeSections.All.Contains(s)))
            errors["sections"] = ["Choose sections from the list."];
        if (choices.ExcludedSkills is { } excluded && (excluded.Count > MaxExcludedSkills || excluded.Any(s => string.IsNullOrWhiteSpace(s) || s.Length > 200)))
            errors["excludedSkills"] = ["Choose skills from the list."];
        return errors;
    }

    /// <summary>Trimmed.</summary>
    public static ResumeContact Normalize(ResumeContact contact) => new(contact.Phone?.Trim() ?? "", contact.Email?.Trim() ?? "", contact.Headline?.Trim() ?? "");

    /// <summary>Sections deduplicated and in print order (unknown ones, e.g. from an older version, dropped); skills trimmed, once each.</summary>
    public static ResumeChoices Normalize(ResumeChoices choices) => new(
        [.. ResumeSections.All.Where(s => choices.Sections?.Contains(s) == true)],
        [.. (choices.ExcludedSkills ?? []).Select(s => s.Trim()).Where(s => s.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase)]);

    [GeneratedRegex(@"^[0-9+()\-. ]*$")]
    private static partial Regex Phone();
}
