using Portfolio.Api.Features.About;

namespace Portfolio.Api.UnitTests.Features.About;

public class AboutRulesTests
{
    private static readonly AboutContent Valid = AboutDefaults.Content;

    private static ExperienceItem Job(string title, DateOnly start, DateOnly? end, params string[] bullets) =>
        new(title, "Company", "Location", start, end, bullets);

    private static Skill SkillUsed(string name, params string[] uses) =>
        new(name, [new SkillPeriod(new DateOnly(2020, 1, 1), null, uses)]);

    private static Place City(params PlaceVisit[] visits) =>
        new(2643123, "Manchester", "England", "United Kingdom", 53.481, -2.237, visits);

    [Fact]
    public void The_placeholder_content_is_valid()
    {
        Assert.Empty(AboutRules.Validate(Valid));
    }

    [Fact]
    public void Missing_content_is_rejected()
    {
        Assert.NotEmpty(AboutRules.Validate(null));
    }

    [Fact]
    public void Empty_sections_and_links_are_allowed()
    {
        var empty = new AboutContent("", [], new AboutLinks("", "", "", ""), AboutDefaults.Colors, [], new ProblemSolving("", []), [], [], [], [], [], [], [], []);

        Assert.Empty(AboutRules.Validate(empty));
    }

    [Theory]
    [InlineData("", true)]
    [InlineData("https://github.com/someone", true)]
    [InlineData("http://example.com/cv.pdf", true)]
    [InlineData("/resume.pdf", true)]
    [InlineData("javascript:alert(1)", false)]
    [InlineData("data:text/html,hi", false)]
    [InlineData("//evil.example.com", false)]
    [InlineData("github.com/someone", false)]
    public void Links_must_be_http_or_site_paths(string url, bool valid)
    {
        var content = Valid with { Links = Valid.Links with { GitHubUrl = url } };

        Assert.Equal(valid, !AboutRules.Validate(content).ContainsKey("links.gitHubUrl"));
    }

    [Theory]
    [InlineData("Studied at [Manchester](https://www.manchester.ac.uk)", true)]
    [InlineData("Plain text [with brackets] (and parentheses)", true)]
    [InlineData("See [my CV](/resume.pdf)", true)]
    [InlineData("[Click](javascript:alert(1))", false)]
    [InlineData("[Click](data:text/html,hi)", false)]
    public void Links_inside_text_must_be_safe_too(string bullet, bool valid)
    {
        var content = Valid with { Experience = [Job("Dev", new DateOnly(2020, 1, 1), null, bullet)] };

        Assert.Equal(valid, !AboutRules.Validate(content).ContainsKey("experience[0].bullets[0]"));
    }

    [Theory]
    [InlineData("#1a73e8", true)]
    [InlineData("#ABCDEF", true)]
    [InlineData("#fff", false)]
    [InlineData("red", false)]
    [InlineData("", false)]
    public void Colours_are_six_digit_hex(string color, bool valid)
    {
        var skills = new Dictionary<string, string>(AboutDefaults.Colors.Skills) { [SkillUses.Academic] = color };
        var content = Valid with { Colors = Valid.Colors with { Skills = skills } };

        Assert.Equal(valid, !AboutRules.Validate(content).ContainsKey("colors.skills.academic"));
    }

    [Fact]
    public void Every_colour_must_be_set()
    {
        var content = Valid with { Colors = new AboutColors(new Dictionary<string, string>(), AboutDefaults.Colors.Places) };

        Assert.Equal(["colors.skills.academic", "colors.skills.personal", "colors.skills.work"], AboutRules.Validate(content).Keys.Order());
    }

    [Fact]
    public void Each_period_of_a_skill_needs_a_use()
    {
        var content = Valid with
        {
            Skills =
            [
                new Skill("Undated", []),
                new Skill("No use", [new SkillPeriod(new DateOnly(2020, 1, 1), null, [])]),
                new Skill("Unknown use", [new SkillPeriod(new DateOnly(2020, 1, 1), null, ["hobby"])]),
                new Skill("Twice", [new SkillPeriod(new DateOnly(2020, 1, 1), null, [SkillUses.Work, SkillUses.Work])]),
                new Skill("Backwards", [new SkillPeriod(new DateOnly(2020, 1, 1), new DateOnly(2019, 1, 1), [SkillUses.Work])]),
            ],
        };

        Assert.Equal(
            ["skills[1].periods[0].uses", "skills[2].periods[0].uses", "skills[3].periods[0].uses", "skills[4].periods[0].end"],
            AboutRules.Validate(content).Keys.Order());
    }

    [Fact]
    public void A_skill_can_have_several_uses_and_periods()
    {
        var content = Valid with
        {
            Skills =
            [
                new Skill("Python",
                [
                    new SkillPeriod(new DateOnly(2015, 10, 1), new DateOnly(2019, 6, 1), [SkillUses.Academic, SkillUses.Personal]),
                    new SkillPeriod(new DateOnly(2024, 1, 1), null, [SkillUses.Work]),
                ]),
            ],
        };

        Assert.Empty(AboutRules.Validate(content));
    }

    [Fact]
    public void A_place_needs_a_position_and_at_least_one_valid_visit()
    {
        var content = Valid with
        {
            Places =
            [
                City(),
                City(new PlaceVisit("lived", "")),
                City(new PlaceVisit(PlaceVisitKinds.Visited, "")) with { Latitude = 91 },
                City(new PlaceVisit(PlaceVisitKinds.Worked, "[Evil](javascript:alert(1))")),
            ],
        };

        Assert.Equal(
            ["places[0].visits", "places[1].visits", "places[2].latitude", "places[3].visits[0].note"],
            AboutRules.Validate(content).Keys.Order());
    }

    [Fact]
    public void Qualifications_need_a_title_but_issuer_date_and_grade_are_optional()
    {
        var content = Valid with
        {
            Qualifications =
            [
                new Qualification("AWS Developer", "", new DateOnly(2024, 3, 1), ""),
                new Qualification(" ", "Issuer", null, new string('g', AboutRules.GradeMaxLength + 1)),
            ],
        };

        Assert.Equal(["qualifications[1].grade", "qualifications[1].title"], AboutRules.Validate(content).Keys.Order());
    }

    [Fact]
    public void Errors_point_at_the_field_that_is_wrong()
    {
        var content = Valid with
        {
            Skills = [SkillUsed(" ", SkillUses.Work)],
            Experience = [new ExperienceItem("", "", "", default, null, [new string('b', AboutRules.BulletMaxLength + 1)])],
            Education = [new EducationItem("BSc", " ", "", new DateOnly(2020, 1, 1), new DateOnly(2019, 1, 1))],
        };

        var errors = AboutRules.Validate(content);

        Assert.Equal(
            ["education[0].end", "education[0].institution", "experience[0].bullets[0]", "experience[0].company", "experience[0].start", "experience[0].title", "skills[0].name"],
            errors.Keys.Order());
    }

    [Fact]
    public void A_page_upgraded_from_the_old_shape_can_be_saved_as_it_is()
    {
        // Skills without periods and qualifications without dates: what AboutJson makes of older pages.
        var content = Valid with
        {
            Skills = [new Skill("C#", [])],
            Qualifications = [new Qualification("Cambridge English", "", null, "")],
        };

        Assert.Empty(AboutRules.Validate(content));
    }

    [Fact]
    public void Location_is_optional_and_start_dates_may_be_in_the_future()
    {
        var content = Valid with { Experience = [new ExperienceItem("Founder", "Next Thing", "", new DateOnly(2030, 1, 1), null, [])] };

        Assert.Empty(AboutRules.Validate(content));
    }

    [Fact]
    public void An_end_in_the_same_month_as_the_start_is_fine()
    {
        var content = Valid with { Experience = [Job("Intern", new DateOnly(2020, 6, 1), new DateOnly(2020, 6, 30))] };

        Assert.Empty(AboutRules.Validate(content));
    }

    [Fact]
    public void Too_many_items_are_rejected()
    {
        var content = Valid with { Skills = [.. Enumerable.Range(0, AboutRules.MaxSkills + 1).Select(i => SkillUsed($"S{i}", SkillUses.Work))] };

        Assert.Contains("skills", AboutRules.Validate(content).Keys);
    }

    [Fact]
    public void Normalize_keeps_the_order_the_admin_chose()
    {
        var content = Valid with
        {
            Experience =
            [
                Job("Old", new DateOnly(2015, 1, 1), new DateOnly(2016, 1, 1)),
                Job("Future", new DateOnly(2030, 3, 1), null),
                Job("Current", new DateOnly(2020, 1, 1), null),
            ],
        };

        var normalized = AboutRules.Normalize(content);

        Assert.Equal(["Old", "Future", "Current"], normalized.Experience.Select(e => e.Title));
    }

    [Fact]
    public void Normalize_puts_uses_and_visits_in_legend_order_and_lower_cases_colours()
    {
        var skills = new Dictionary<string, string>(AboutDefaults.Colors.Skills) { [SkillUses.Work] = "#ABCDEF" };
        var content = Valid with
        {
            Colors = Valid.Colors with { Skills = skills },
            Skills = [SkillUsed("C#", SkillUses.Personal, SkillUses.Work)],
            Places = [City(new PlaceVisit(PlaceVisitKinds.Visited, " "), new PlaceVisit(PlaceVisitKinds.Worked, " Acme "))],
        };

        var normalized = AboutRules.Normalize(content);

        Assert.Equal("#abcdef", normalized.Colors.Skills[SkillUses.Work]);
        Assert.Equal([SkillUses.Work, SkillUses.Personal], normalized.Skills[0].Periods[0].Uses);
        Assert.Equal([new PlaceVisit(PlaceVisitKinds.Worked, "Acme"), new PlaceVisit(PlaceVisitKinds.Visited, "")], normalized.Places[0].Visits);
    }

    [Fact]
    public void Normalize_trims_text_drops_empty_bullets_and_keeps_month_precision()
    {
        var content = Valid with
        {
            PhotoUrl = " /me.jpg ",
            Experience = [new ExperienceItem(" Dev ", " [Co](https://co.example) ", " City ", new DateOnly(2020, 5, 17), new DateOnly(2021, 2, 9), [" Did things ", "", "   "])],
            Papers = [new Paper(" A paper ", " /api/files/x/p.pdf ")],
            Statuses = [new Status(" EU citizenship ", "eu")],
            Licences = [new Licence("driving", " B ", " Car ")],
            Hackathons = [new Hackathon(" Hack ", 2024, [" Won ", ""])],
            Qualifications = [new Qualification(" Cert ", " Issuer ", new DateOnly(2024, 3, 15), " A ")],
        };

        var normalized = AboutRules.Normalize(content);

        Assert.Equal("/me.jpg", normalized.PhotoUrl);
        var job = normalized.Experience[0];
        Assert.Equal(("Dev", "[Co](https://co.example)", "City"), (job.Title, job.Company, job.Location));
        Assert.Equal((new DateOnly(2020, 5, 1), new DateOnly(2021, 2, 1)), (job.Start, job.End));
        Assert.Equal(["Did things"], job.Bullets);
        Assert.Equal([new Paper("A paper", "/api/files/x/p.pdf")], normalized.Papers);
        Assert.Equal([new Status("EU citizenship", "EU")], normalized.Statuses);
        Assert.Equal(new Licence("driving", "B", "Car"), normalized.Licences[0]);
        Assert.Equal(("Hack", 2024), (normalized.Hackathons[0].Name, normalized.Hackathons[0].Year));
        Assert.Equal(["Won"], normalized.Hackathons[0].Bullets);
        Assert.Equal(new Qualification("Cert", "Issuer", new DateOnly(2024, 3, 1), "A"), normalized.Qualifications[0]);
    }

    [Fact]
    public void Papers_need_a_title_and_a_safe_file_link()
    {
        var content = Valid with { Papers = [new Paper(" ", ""), new Paper("Mine", "javascript:alert(1)"), new Paper("Fine", "")] };

        Assert.Equal(["papers[0].title", "papers[1].fileUrl"], AboutRules.Validate(content).Keys.Order());
    }

    [Fact]
    public void Languages_licences_and_hackathons_are_checked()
    {
        var content = Valid with
        {
            Languages = [new Language("Danish", "beginner"), new Language("", "expert")],
            Licences = [new Licence("flying", "PPL(A)", "Private pilot, aeroplanes"), new Licence("space", "", "")],
            Hackathons = [new Hackathon("HackMCR", 2022, ["Built a thing"]), new Hackathon("", 22, [])],
        };

        Assert.Equal(
            ["hackathons[1].name", "hackathons[1].year", "languages[1].level", "languages[1].name", "licences[1].category", "licences[1].name"],
            AboutRules.Validate(content).Keys.Order());
    }

    [Theory]
    [InlineData("RO", true)]
    [InlineData("EU", true)]
    [InlineData("", true)]
    [InlineData("ROU", false)]
    [InlineData("1A", false)]
    public void A_label_flag_is_a_country_code_eu_or_nothing(string flag, bool valid)
    {
        var content = Valid with { Statuses = [new Status("Citizenship", flag)] };

        Assert.Equal(valid, !AboutRules.Validate(content).ContainsKey("statuses[0].flag"));
    }

    [Theory]
    [InlineData("", true)]
    [InlineData("neetcode", true)]
    [InlineData("Claudiu_J-92", true)]
    [InlineData(" neetcode ", true)]
    [InlineData("https://leetcode.com/u/neetcode", false)]
    [InlineData("two words", false)]
    public void The_leetcode_username_is_just_the_name(string username, bool valid)
    {
        var content = Valid with { ProblemSolving = new ProblemSolving(username, []) };

        Assert.Equal(valid, !AboutRules.Validate(content).ContainsKey("problemSolving.leetCodeUsername"));
    }

    [Fact]
    public void NeetCode_lists_must_be_known_and_ticked_once()
    {
        Assert.Empty(AboutRules.Validate(Valid with { ProblemSolving = new ProblemSolving("", [NeetCodeListIds.NeetCode250, NeetCodeListIds.Blind75]) }));
        Assert.Contains("problemSolving.neetCodeLists", AboutRules.Validate(Valid with { ProblemSolving = new ProblemSolving("", ["grind169"]) }).Keys);
        Assert.Contains("problemSolving.neetCodeLists", AboutRules.Validate(Valid with { ProblemSolving = new ProblemSolving("", [NeetCodeListIds.Blind75, NeetCodeListIds.Blind75]) }).Keys);
    }

    [Fact]
    public void Normalize_trims_the_username_and_puts_neetcode_lists_in_order()
    {
        var content = Valid with { ProblemSolving = new ProblemSolving(" neetcode ", [NeetCodeListIds.NeetCode250, NeetCodeListIds.Blind75]) };

        var normalized = AboutRules.Normalize(content).ProblemSolving;

        Assert.Equal("neetcode", normalized.LeetCodeUsername);
        Assert.Equal([NeetCodeListIds.Blind75, NeetCodeListIds.NeetCode250], normalized.NeetCodeLists);
    }
}
