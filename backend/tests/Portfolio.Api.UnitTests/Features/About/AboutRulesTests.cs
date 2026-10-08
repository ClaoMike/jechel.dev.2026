using Portfolio.Api.Features.About;

namespace Portfolio.Api.UnitTests.Features.About;

public class AboutRulesTests
{
    private static readonly AboutContent Valid = AboutDefaults.Content;

    private static ExperienceItem Job(string title, DateOnly start, DateOnly? end, params string[] bullets) =>
        new(title, "Company", "Location", start, end, bullets);

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
        var empty = new AboutContent("", new AboutLinks("", "", "", ""), [], [], [], [], []);

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
    [InlineData(-1, false)]
    [InlineData(0, true)]
    [InlineData(100, true)]
    [InlineData(101, false)]
    public void Skill_levels_are_0_to_100(int level, bool valid)
    {
        var content = Valid with { Skills = [new Skill("C#", level)] };

        Assert.Equal(valid, !AboutRules.Validate(content).ContainsKey("skills[0].level"));
    }

    [Fact]
    public void Errors_point_at_the_field_that_is_wrong()
    {
        var content = Valid with
        {
            Skills = [new Skill(" ", 50)],
            Experience = [new ExperienceItem("", "", "", default, null, [new string('b', AboutRules.BulletMaxLength + 1)])],
            Education = [new EducationItem("BSc", " ", "", new DateOnly(2020, 1, 1), new DateOnly(2019, 1, 1))],
        };

        var errors = AboutRules.Validate(content);

        Assert.Equal(
            ["education[0].end", "education[0].institution", "experience[0].bullets[0]", "experience[0].company", "experience[0].start", "experience[0].title", "skills[0].name"],
            errors.Keys.Order());
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
        var content = Valid with { Skills = [.. Enumerable.Range(0, AboutRules.MaxSkills + 1).Select(i => new Skill($"S{i}", 50))] };

        Assert.Contains("skills", AboutRules.Validate(content).Keys);
    }

    [Fact]
    public void Normalize_orders_experience_newest_first_with_ongoing_roles_on_top()
    {
        var content = Valid with
        {
            Experience =
            [
                Job("Old", new DateOnly(2015, 1, 1), new DateOnly(2016, 1, 1)),
                Job("Future", new DateOnly(2030, 3, 1), null),
                Job("Ended", new DateOnly(2020, 1, 1), new DateOnly(2021, 1, 1)),
                Job("Current", new DateOnly(2020, 1, 1), null),
            ],
        };

        var normalized = AboutRules.Normalize(content);

        Assert.Equal(["Future", "Current", "Ended", "Old"], normalized.Experience.Select(e => e.Title));
    }

    [Fact]
    public void Normalize_trims_text_drops_empty_bullets_and_keeps_month_precision()
    {
        var content = Valid with
        {
            PhotoUrl = " /me.jpg ",
            Experience = [new ExperienceItem(" Dev ", " Co ", " City ", new DateOnly(2020, 5, 17), new DateOnly(2021, 2, 9), [" Did things ", "", "   "])],
            Papers = [" A paper ", ""],
        };

        var normalized = AboutRules.Normalize(content);

        Assert.Equal("/me.jpg", normalized.PhotoUrl);
        var job = normalized.Experience[0];
        Assert.Equal(("Dev", "Co", "City"), (job.Title, job.Company, job.Location));
        Assert.Equal((new DateOnly(2020, 5, 1), new DateOnly(2021, 2, 1)), (job.Start, job.End));
        Assert.Equal(["Did things"], job.Bullets);
        Assert.Equal(["A paper"], normalized.Papers);
    }
}
