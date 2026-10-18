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
        Assert.Contains("GitHub", text);
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
        Assert.DoesNotContain("GitHub", text);
        Assert.DoesNotContain("I build web apps.", text);
        // The contact line isn't a section: it's always there.
        Assert.Contains("7700", text);
    }

    [Fact]
    public void Skills_have_no_dates_and_can_be_left_out()
    {
        var skills = new List<Skill> { new("C#", [new SkillPeriod(new DateOnly(2020, 1, 1), null, ["work"])]), new("[Go](https://go.dev)", []), new("Cobol", []) };

        Assert.Equal("C#, Go", ResumeDocument.SkillsLine(skills, ["cobol"]));
    }

    [Fact]
    public void Links_are_named_not_spelled_out()
    {
        var links = ResumeDocument.Links(Input(Settings(), includePhone: false)).ToList();

        Assert.Equal([("jechel.dev", "https://jechel.dev"), ("GitHub", "https://github.com/cjechel"), ("LinkedIn", "https://www.linkedin.com/in/cjechel")], links);
        var text = TextOf(ResumeDocument.Build(Input(Settings(), includePhone: false)));
        Assert.DoesNotContain("github.com", text);
    }

    [Fact]
    public void Only_the_first_page_has_the_header()
    {
        var experience = Enumerable.Range(1, 30).Select(i => new ExperienceItem($"Role {i}", "Company", "", new DateOnly(2000 + i % 20, 1, 1), null, ["Did a lot of things.", "Did more things."])).ToList();
        var input = Input(Settings(), includePhone: true) with { About = About with { Experience = experience } };

        using var document = PdfDocument.Open(ResumeDocument.Build(input));
        var pages = document.GetPages().Select(p => p.Text).ToList();

        Assert.True(pages.Count > 1);
        Assert.Contains(ResumeDocument.Name, pages[0]);
        Assert.All(pages.Skip(1), page => Assert.DoesNotContain("Claudiu", page));
        Assert.All(pages.Skip(1), page => Assert.DoesNotContain("7700", page));
    }

    [Fact]
    public void Licences_and_places_become_lines()
    {
        Assert.Equal("Driving: B (Car), A (Motorcycle)  ·  Flying: Drone", ResumeDocument.LicencesLine(
            [new Licence("driving", "B", "Car"), new Licence("flying", "", "Drone"), new Licence("driving", "A", "Motorcycle")]));
        Assert.Equal(["Studied in: Bucharest (Romania)", "Visited: London (United Kingdom)"],
            ResumeDocument.PlacesLines([.. AboutDefaults.Content.Places.Select(p => p with { Visits = [.. p.Visits.Where(v => v.Kind != PlaceVisitKinds.Worked)] })]));
    }
}
