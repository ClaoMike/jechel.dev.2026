namespace Portfolio.Api.Features.About;

/// <summary>
/// Everything on the About Me page, edited by the admin and stored as one JSON document.
/// Dates have month precision: the day is always 1.
/// </summary>
public record AboutContent(
    string PhotoUrl,
    AboutLinks Links,
    IReadOnlyList<Skill> Skills,
    IReadOnlyList<ExperienceItem> Experience,
    IReadOnlyList<EducationItem> Education,
    IReadOnlyList<string> Papers,
    IReadOnlyList<string> Qualifications);

/// <summary>Empty strings hide the link.</summary>
public record AboutLinks(string ResumeUrl, string GitHubUrl, string LinkedInUrl, string InstagramUrl);

/// <param name="Level">0 to 100.</param>
public record Skill(string Name, int Level);

/// <param name="Start">May be in the future.</param>
/// <param name="End">Null while ongoing.</param>
public record ExperienceItem(string Title, string Company, string Location, DateOnly Start, DateOnly? End, IReadOnlyList<string> Bullets);

/// <param name="Title">The degree or course, e.g. "BSc Computer Science".</param>
public record EducationItem(string Title, string Institution, string Location, DateOnly Start, DateOnly? End);

/// <summary>Shown until the admin saves the page for the first time.</summary>
public static class AboutDefaults
{
    public static readonly AboutContent Content = new(
        PhotoUrl: "",
        Links: new AboutLinks(ResumeUrl: "", GitHubUrl: "https://github.com/", LinkedInUrl: "https://www.linkedin.com/", InstagramUrl: "https://www.instagram.com/"),
        Skills:
        [
            new Skill("C#", 90),
            new Skill("TypeScript", 85),
            new Skill("React", 80),
            new Skill("SQL / PostgreSQL", 75),
            new Skill("Python", 70),
            new Skill("Docker", 60),
        ],
        Experience:
        [
            new ExperienceItem("Senior Software Engineer", "Placeholder Company", "Remote", new DateOnly(2023, 1, 1), null,
                ["Placeholder: what you did in this role.", "Placeholder: a result you're proud of."]),
            new ExperienceItem("Software Engineer", "Another Placeholder Ltd", "Bucharest, Romania", new DateOnly(2019, 6, 1), new DateOnly(2022, 12, 1),
                ["Placeholder: what you did in this role."]),
        ],
        Education:
        [
            new EducationItem("BSc Computer Science", "Placeholder University", "Bucharest, Romania", new DateOnly(2015, 10, 1), new DateOnly(2019, 6, 1)),
        ],
        Papers: ["Placeholder: Author, A. (2020). Title of the paper. Journal name, 1(2), 3-4."],
        Qualifications: ["Placeholder: a certification (Issuer, 2024)"]);
}
