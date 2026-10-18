using System.Text.RegularExpressions;
using Portfolio.Api.Features.Contact;

namespace Portfolio.Api.Features.Resume;

/// <summary>The parts of the About Me page a résumé can include, in the order they're printed.</summary>
public static class ResumeSections
{
    public const string Summary = "summary";
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
        [Summary, Statuses, Links, Experience, Skills, Education, Qualifications, Papers, Hackathons, ProblemSolving, Languages, Licences, Places];

    /// <summary>Until the admin chooses: what recruiters read; not the map, LeetCode or licences.</summary>
    public static readonly IReadOnlyList<string> Defaults =
        [Summary, Statuses, Links, Experience, Skills, Education, Qualifications, Papers, Hackathons, Languages];
}

/// <param name="Sections">Ids from <see cref="ResumeSections.All"/>; printed in that order, whatever the order here.</param>
public record ResumeSettingsRequest(string? Phone, string? Email, string? Headline, string? Location, string? Summary, IReadOnlyList<string>? Sections);

/// <param name="GeneratedAt">When the PDFs were last made; null before the first time.</param>
public record ResumeSettingsDto(string Phone, string Email, string Headline, string Location, string Summary, IReadOnlyList<string> Sections, DateTimeOffset? GeneratedAt);

public static partial class ResumeRules
{
    public const int PhoneMaxLength = 30;
    public const int HeadlineMaxLength = 150;
    public const int LocationMaxLength = 100;
    public const int SummaryMaxLength = 1500;

    public static Dictionary<string, string[]> Validate(ResumeSettingsRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        var phone = request.Phone?.Trim() ?? "";
        var email = request.Email?.Trim() ?? "";

        if (phone.Length > PhoneMaxLength || !Phone().IsMatch(phone))
            errors["phone"] = [$"Use digits, spaces, + ( ) - and dots, at most {PhoneMaxLength} characters."];
        if (email.Length > 0 && (email.Length > ContactRules.EmailMaxLength || !ContactRules.IsEmail(email)))
            errors["email"] = ["Enter a valid email address, or leave it empty."];
        if ((request.Headline?.Trim().Length ?? 0) > HeadlineMaxLength)
            errors["headline"] = [$"At most {HeadlineMaxLength} characters."];
        if ((request.Location?.Trim().Length ?? 0) > LocationMaxLength)
            errors["location"] = [$"At most {LocationMaxLength} characters."];
        if ((request.Summary?.Trim().Length ?? 0) > SummaryMaxLength)
            errors["summary"] = [$"At most {SummaryMaxLength} characters."];
        if (request.Sections is null || request.Sections.Any(s => !ResumeSections.All.Contains(s)))
            errors["sections"] = ["Choose sections from the list."];

        return errors;
    }

    /// <summary>Trimmed, sections deduplicated and in print order.</summary>
    public static ResumeSettingsRequest Normalize(ResumeSettingsRequest request) => new(
        request.Phone?.Trim() ?? "",
        request.Email?.Trim() ?? "",
        request.Headline?.Trim() ?? "",
        request.Location?.Trim() ?? "",
        request.Summary?.Trim() ?? "",
        [.. ResumeSections.All.Where(s => request.Sections?.Contains(s) == true)]);

    [GeneratedRegex(@"^[0-9+()\-. ]*$")]
    private static partial Regex Phone();
}
