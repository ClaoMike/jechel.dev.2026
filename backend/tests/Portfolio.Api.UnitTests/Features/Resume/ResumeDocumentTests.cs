using Portfolio.Api.Features.About;
using Portfolio.Api.Features.LeetCode;
using Portfolio.Api.Features.Resume;
using UglyToad.PdfPig;

namespace Portfolio.Api.UnitTests.Features.Resume;

public class ResumeDocumentTests
{
    private static readonly DateOnly Today = new(2026, 10, 18);
    private const string PhoneNumber = "+44 7700 900123";

    private static readonly AboutContent About = AboutDefaults.Content with
    {
        Statuses = [new Status("UK Settled Status", "GB")],
        Links = new AboutLinks("", "https://github.com/cjechel", "https://www.linkedin.com/in/cjechel", ""),
        Experience = [new ExperienceItem("Senior Engineer", "[Acme](https://acme.example)", "Manchester", new DateOnly(2023, 1, 1), null, ["Cut API latency by 40%."])],
        ProblemSolving = new ProblemSolving("neetcode", [NeetCodeListIds.Blind75]),
    };

    private static ResumeSettingsRequest Settings(params string[] sections) =>
        new(PhoneNumber, "claudiu@example.com", "Full-stack engineer", "Manchester, UK", "I build web apps.", sections.Length == 0 ? ResumeSections.All : sections);

    private static string TextOf(byte[] pdf)
    {
        using var document = PdfDocument.Open(pdf);
        return string.Join("\n", document.GetPages().Select(p => p.Text));
    }

    private static ResumeInput Input(ResumeSettingsRequest settings, bool includePhone) =>
        new(About, settings, new LeetCodeStats("NeetCode", new DifficultyCounts(205, 103, 98, 4), new DifficultyCounts(4000, 900, 2100, 1000), default), includePhone, Today, "https://jechel.dev");

    [Fact]
    public void The_phone_number_is_only_in_the_private_copy()
    {
        var publicText = TextOf(ResumeDocument.Build(Input(Settings(), includePhone: false)));
        var privateText = TextOf(ResumeDocument.Build(Input(Settings(), includePhone: true)));

        Assert.DoesNotContain("7700", publicText);
        Assert.Contains("7700", privateText);
        Assert.Contains("claudiu@example.com", publicText);
    }

    [Fact]
    public void It_holds_the_chosen_sections_and_links_print_as_their_text()
    {
        var text = TextOf(ResumeDocument.Build(Input(Settings(), includePhone: false)));

        Assert.Contains(ResumeDocument.Name, text);
        Assert.Contains("Senior Engineer", text);
        Assert.Contains("Acme", text);
        Assert.DoesNotContain("](", text);
        Assert.Contains("Jan 2023 – Present", text);
        Assert.Contains("UK Settled Status", text);
        Assert.Contains("github.com/cjechel", text);
        Assert.Contains("205 problems solved", text);
    }

    [Fact]
    public void Sections_left_out_are_not_printed()
    {
        var text = TextOf(ResumeDocument.Build(Input(Settings(ResumeSections.Experience), includePhone: true)));

        Assert.Contains("Senior Engineer", text);
        Assert.DoesNotContain("PROBLEM SOLVING", text);
        Assert.DoesNotContain("LeetCode", text);
        Assert.DoesNotContain("PLACES", text);
        Assert.DoesNotContain("UK Settled Status", text);
        Assert.DoesNotContain("github.com", text);
        Assert.DoesNotContain("I build web apps.", text);
        // The contact line isn't a section: it's always there.
        Assert.Contains("7700", text);
    }

    [Fact]
    public void MonthsUsed_counts_overlaps_once_and_not_the_future()
    {
        var skill = new Skill("C#",
        [
            new SkillPeriod(new DateOnly(2020, 1, 1), new DateOnly(2020, 12, 1), ["work"]),
            new SkillPeriod(new DateOnly(2020, 6, 1), new DateOnly(2021, 5, 1), ["personal"]),
            new SkillPeriod(new DateOnly(2027, 1, 1), null, ["work"]),
        ]);

        Assert.Equal(17, ResumeDocument.MonthsUsed(skill, Today));
        Assert.Equal("C# (1 year), Go", ResumeDocument.SkillsLine([skill, new Skill("Go", [])], Today));
    }

    [Theory]
    [InlineData(1, "1 month")]
    [InlineData(11, "11 months")]
    [InlineData(18, "2 years")]
    [InlineData(17, "1 year")]
    public void Experience_reads_like_the_page(int months, string expected) => Assert.Equal(expected, ResumeDocument.Experience(months));

    [Fact]
    public void Licences_and_places_become_lines()
    {
        Assert.Equal("Driving: B (Car), A (Motorcycle)  ·  Flying: Drone", ResumeDocument.LicencesLine(
            [new Licence("driving", "B", "Car"), new Licence("flying", "", "Drone"), new Licence("driving", "A", "Motorcycle")]));
        Assert.Equal(["Studied in: Bucharest (Romania)", "Visited: London (United Kingdom)"],
            ResumeDocument.PlacesLines([.. AboutDefaults.Content.Places.Select(p => p with { Visits = [.. p.Visits.Where(v => v.Kind != PlaceVisitKinds.Worked)] })]));
    }
}
