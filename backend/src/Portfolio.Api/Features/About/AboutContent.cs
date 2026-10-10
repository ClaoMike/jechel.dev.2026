namespace Portfolio.Api.Features.About;

/// <summary>
/// Everything on the About Me page, edited by the admin and stored as one JSON document.
/// Dates have month precision: the day is always 1. Lists are shown in the order stored.
/// Free text may contain links written as [text](https://…).
/// </summary>
/// <param name="Statuses">Labels shown under the photo, each with a flag, e.g. 🇬🇧 "UK Settled Status".</param>
public record AboutContent(
    string PhotoUrl,
    IReadOnlyList<Status> Statuses,
    AboutLinks Links,
    AboutColors Colors,
    IReadOnlyList<Place> Places,
    IReadOnlyList<Skill> Skills,
    IReadOnlyList<ExperienceItem> Experience,
    IReadOnlyList<EducationItem> Education,
    IReadOnlyList<Paper> Papers,
    IReadOnlyList<Qualification> Qualifications,
    IReadOnlyList<Language> Languages,
    IReadOnlyList<Licence> Licences,
    IReadOnlyList<Hackathon> Hackathons);

/// <summary>A citizenship or residence label.</summary>
/// <param name="Flag">ISO 3166 country code ("RO", "GB"), "EU", or empty for no flag.</param>
public record Status(string Text, string Flag);

/// <summary>Empty strings hide the link.</summary>
public record AboutLinks(string ResumeUrl, string GitHubUrl, string LinkedInUrl, string InstagramUrl);

/// <summary>The colours of the legends, as "#rrggbb".</summary>
/// <param name="Skills">Keyed by <see cref="SkillUses"/>.</param>
/// <param name="Places">Keyed by <see cref="PlaceVisitKinds"/>.</param>
public record AboutColors(IReadOnlyDictionary<string, string> Skills, IReadOnlyDictionary<string, string> Places);

/// <summary>What a skill was used for.</summary>
public static class SkillUses
{
    public const string Work = "work";
    public const string Academic = "academic";
    public const string Personal = "personal";
    public static readonly IReadOnlyList<string> All = [Work, Academic, Personal];
}

/// <summary>What happened in a place.</summary>
public static class PlaceVisitKinds
{
    public const string Worked = "worked";
    public const string Studied = "studied";
    public const string Visited = "visited";
    public static readonly IReadOnlyList<string> All = [Worked, Studied, Visited];
}

/// <param name="Periods">May be empty: skills saved before they had periods are shown without a bar.</param>
public record Skill(string Name, IReadOnlyList<SkillPeriod> Periods);

/// <param name="End">Null while still in use.</param>
/// <param name="Uses">One or more of <see cref="SkillUses"/>.</param>
public record SkillPeriod(DateOnly Start, DateOnly? End, IReadOnlyList<string> Uses);

/// <summary>A city on the "Where I've been" map.</summary>
/// <param name="Id">The GeoNames id, from the city search.</param>
public record Place(long Id, string Name, string Region, string Country, double Latitude, double Longitude, IReadOnlyList<PlaceVisit> Visits);

/// <param name="Kind">One of <see cref="PlaceVisitKinds"/>.</param>
/// <param name="Note">Shown when hovering the city, e.g. "BSc at [The University of Manchester](https://…)". Optional.</param>
public record PlaceVisit(string Kind, string Note);

/// <param name="Start">May be in the future.</param>
/// <param name="End">Null while ongoing.</param>
public record ExperienceItem(string Title, string Company, string Location, DateOnly Start, DateOnly? End, IReadOnlyList<string> Bullets);

/// <param name="Title">The degree or course, e.g. "BSc Computer Science".</param>
public record EducationItem(string Title, string Institution, string Location, DateOnly Start, DateOnly? End);

/// <param name="Issuer">Optional.</param>
/// <param name="Obtained">Optional: pages saved before qualifications had dates have none.</param>
/// <param name="Grade">Optional, e.g. "First Class" or "870/1000".</param>
public record Qualification(string Title, string Issuer, DateOnly? Obtained, string Grade);

/// <param name="FileUrl">The uploaded PDF (a /api/files/… path), or empty: then the title isn't a link.</param>
public record Paper(string Title, string FileUrl);

/// <param name="Level">One of <see cref="LanguageLevels"/>.</param>
public record Language(string Name, string Level);

public static class LanguageLevels
{
    public static readonly IReadOnlyList<string> All = ["native", "fluent", "advanced", "intermediate", "beginner"];
}

/// <summary>A driving, flying or boating licence.</summary>
/// <param name="Category">One of <see cref="LicenceCategories"/>.</param>
/// <param name="Code">Short code shown in the label, e.g. "B" or "PPL(A)"; optional.</param>
/// <param name="Name">What it allows, e.g. "Car".</param>
public record Licence(string Category, string Code, string Name);

public static class LicenceCategories
{
    public static readonly IReadOnlyList<string> All = ["driving", "flying", "boating", "other"];
}

/// <param name="Bullets">What was built, the result, …</param>
public record Hackathon(string Name, int Year, IReadOnlyList<string> Bullets);

/// <summary>Shown until the admin saves the page for the first time.</summary>
public static class AboutDefaults
{
    public static readonly AboutColors Colors = new(
        Skills: new Dictionary<string, string> { [SkillUses.Work] = "#188038", [SkillUses.Academic] = "#1a73e8", [SkillUses.Personal] = "#e8710a" },
        Places: new Dictionary<string, string> { [PlaceVisitKinds.Worked] = "#188038", [PlaceVisitKinds.Studied] = "#1a73e8", [PlaceVisitKinds.Visited] = "#e8710a" });

    public static readonly AboutContent Content = new(
        PhotoUrl: "",
        Statuses: [new Status("Placeholder: a citizenship", "EU"), new Status("Placeholder: a residence status", "")],
        Links: new AboutLinks(ResumeUrl: "", GitHubUrl: "https://github.com/", LinkedInUrl: "https://www.linkedin.com/", InstagramUrl: "https://www.instagram.com/"),
        Colors: Colors,
        Places:
        [
            new Place(683506, "Bucharest", "Bucureşti", "Romania", 44.432, 26.106,
                [new PlaceVisit(PlaceVisitKinds.Studied, "Placeholder: what you studied here."), new PlaceVisit(PlaceVisitKinds.Worked, "Placeholder: where you worked.")]),
            new Place(2643743, "London", "England", "United Kingdom", 51.509, -0.126, [new PlaceVisit(PlaceVisitKinds.Visited, "")]),
        ],
        Skills:
        [
            new Skill("C#", [new SkillPeriod(new DateOnly(2016, 10, 1), new DateOnly(2019, 6, 1), [SkillUses.Academic]), new SkillPeriod(new DateOnly(2019, 6, 1), null, [SkillUses.Work])]),
            new Skill("TypeScript", [new SkillPeriod(new DateOnly(2020, 1, 1), null, [SkillUses.Work, SkillUses.Personal])]),
            new Skill("Python", [new SkillPeriod(new DateOnly(2015, 10, 1), new DateOnly(2021, 1, 1), [SkillUses.Academic, SkillUses.Personal])]),
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
        Papers: [new Paper("Placeholder: Author, A. (2020). Title of the paper. Journal name, 1(2), 3-4.", "")],
        Qualifications: [new Qualification("Placeholder: a certification", "Issuer", new DateOnly(2024, 1, 1), "")],
        Languages: [new Language("English", "fluent"), new Language("Romanian", "native")],
        Licences: [new Licence("driving", "B", "Car")],
        Hackathons: [new Hackathon("Placeholder Hackathon", 2024, ["Placeholder: what you built."])]);
}
