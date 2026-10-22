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

    private static readonly ResumeContact Contact = new(PhoneNumber, "claudiu@example.com", "Full-stack engineer");

    private static ResumeChoices Settings(params string[] sections) => new(sections.Length == 0 ? ResumeSections.All : sections, []);

    private static string TextOf(byte[] pdf)
    {
        using var document = PdfDocument.Open(pdf);
        return string.Join("\n", document.GetPages().Select(p => p.Text));
    }

    private static ResumeInput Input(ResumeChoices choices, bool includePhone) =>
        new(About, Contact, choices, new LeetCodeStats("NeetCode", new DifficultyCounts(205, 103, 98, 4), new DifficultyCounts(4000, 900, 2100, 1000), default), includePhone, Today, "https://jechel.dev");

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
        // No page numbers.
        Assert.DoesNotContain("1 / ", pages[0]);
    }

    [Fact]
    public void Licences_and_places_become_lines()
    {
        Assert.Equal("Driving: B (Car), A (Motorcycle)  ·  Flying: Drone", ResumeDocument.LicencesLine(
            [new Licence("driving", "B", "Car"), new Licence("flying", "", "Drone"), new Licence("driving", "A", "Motorcycle")]));
        Assert.Equal(["Studied in: Bucharest (Romania)", "Visited: London (United Kingdom)"],
            ResumeDocument.PlacesLines([.. AboutDefaults.Content.Places.Select(p => p with { Visits = [.. p.Visits.Where(v => v.Kind != PlaceVisitKinds.Worked)] })]));
    }

    [Fact]
    public void Without_a_headline_email_or_phone_the_header_is_just_the_name_and_links()
    {
        var input = Input(Settings(ResumeSections.Links), includePhone: true) with { Contact = new ResumeContact("", "", "") };

        var text = TextOf(ResumeDocument.Build(input));

        Assert.Contains(ResumeDocument.Name, text);
        Assert.Contains("jechel.dev", text);
        Assert.DoesNotContain("Full-stack engineer", text);
        Assert.DoesNotContain("@", text);
    }

    [Fact]
    public void Placeholder_profile_links_are_left_out()
    {
        var input = Input(Settings(), includePhone: false) with { About = About with { Links = AboutDefaults.Content.Links } };

        Assert.Equal([("jechel.dev", "https://jechel.dev")], ResumeDocument.Links(input));
        Assert.Equal([("example.org", "https://www.example.org")], ResumeDocument.Links(input with { SiteUrl = "https://www.example.org" }));
    }

    [Fact]
    public void Periods_say_present_while_ongoing()
    {
        Assert.Equal("Jan 2023 – Present", ResumeDocument.Dates(new DateOnly(2023, 1, 1), null));
        Assert.Equal("Sep 2019 – Jun 2022", ResumeDocument.Dates(new DateOnly(2019, 9, 1), new DateOnly(2022, 6, 1)));
    }

    [Fact]
    public void Problem_solving_is_left_out_with_nothing_to_say()
    {
        Assert.Null(ResumeDocument.ProblemSolvingLine(new ProblemSolving("", []), null));
        Assert.Equal("NeetCode lists completed: Blind 75, NeetCode 150", ResumeDocument.ProblemSolvingLine(new ProblemSolving("", [NeetCodeListIds.Blind75, NeetCodeListIds.NeetCode150]), null));

        var text = TextOf(ResumeDocument.Build(Input(Settings(ResumeSections.ProblemSolving), includePhone: false) with { About = About with { ProblemSolving = new ProblemSolving("", []) }, LeetCode = null }));
        Assert.DoesNotContain("PROBLEM SOLVING", text);
    }

    [Fact]
    public void Empty_sections_are_not_printed_even_when_chosen()
    {
        var empty = About with { Experience = [], Education = [], Papers = [], Hackathons = [], Qualifications = [], Languages = [], Licences = [], Places = [], Skills = [] };

        var text = TextOf(ResumeDocument.Build(Input(Settings(), includePhone: false) with { About = empty, LeetCode = null }));

        foreach (var heading in new[] { "EXPERIENCE", "SKILLS", "EDUCATION", "PUBLICATIONS", "HACKATHONS", "LANGUAGES", "LICENCES", "PLACES", "QUALIFICATIONS" })
        {
            Assert.DoesNotContain(heading, text);
        }
    }

    [Fact]
    public void Every_section_is_printed_in_order_when_chosen()
    {
        var text = TextOf(ResumeDocument.Build(Input(Settings(), includePhone: false)));

        var headings = new[] { "EXPERIENCE", "SKILLS", "EDUCATION", "QUALIFICATIONS", "PUBLICATIONS", "HACKATHONS", "PROBLEM SOLVING", "LANGUAGES", "LICENCES", "PLACES" };
        var positions = headings.Select(h => text.IndexOf(h, StringComparison.Ordinal)).ToList();
        Assert.All(positions, position => Assert.True(position >= 0));
        Assert.Equal(positions.Order(), positions);
    }

    private static List<string> LinksIn(byte[] pdf)
    {
        using var document = PdfDocument.Open(pdf);
        return [.. document.GetPages().SelectMany(p => p.GetHyperlinks()).Select(h => h.Uri)];
    }

    [Fact]
    public void A_paper_with_its_file_links_to_it_on_the_site_and_one_without_is_plain()
    {
        var input = Input(Settings(), includePhone: false) with
        {
            About = About with { Papers = [new Paper("Lighthouse beams", "/api/files/0b9e3c1a-6f5d-4b8e-9a1c-2d3e4f5a6b7c/beams.pdf"), new Paper("Unpublished", "")] },
        };

        var pdf = ResumeDocument.Build(input);

        Assert.Contains("https://jechel.dev/api/files/0b9e3c1a-6f5d-4b8e-9a1c-2d3e4f5a6b7c/beams.pdf", LinksIn(pdf));
        Assert.Contains("Lighthouse beams", TextOf(pdf));
        Assert.Contains("Unpublished", TextOf(pdf));
    }

    [Fact]
    public void A_link_in_text_that_isnt_safe_shows_as_plain_words()
    {
        var input = Input(Settings(), includePhone: false) with
        {
            About = About with { Experience = [new ExperienceItem("Engineer", "Acme", "", new DateOnly(2023, 1, 1), null, ["Built [the tool](javascript:alert(1)) and [the site](/apps)."])] },
        };

        var pdf = ResumeDocument.Build(input);

        Assert.Contains("Built the tool and the site.", TextOf(pdf).Replace("\n", " "));
        Assert.DoesNotContain(LinksIn(pdf), l => l.StartsWith("javascript", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("https://jechel.dev/apps", LinksIn(pdf));
    }

    [Fact]
    public void Choices_without_a_skills_list_hide_none_and_a_www_site_is_named_without_it()
    {
        var input = Input(new ResumeChoices(ResumeSections.All, null!), includePhone: false) with { SiteUrl = "https://www.jechel.dev" };

        Assert.NotEmpty(ResumeDocument.Build(input));
        Assert.Equal("jechel.dev", ResumeDocument.Links(input).First().Label);
    }
}
