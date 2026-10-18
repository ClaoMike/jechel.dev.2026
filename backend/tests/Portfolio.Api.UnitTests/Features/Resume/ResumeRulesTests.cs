using Portfolio.Api.Features.Resume;

namespace Portfolio.Api.UnitTests.Features.Resume;

public class ResumeRulesTests
{
    [Fact]
    public void Valid_settings_have_no_errors()
    {
        Assert.Empty(ResumeRules.Validate(new ResumeSettingsRequest("+44 (0)7700-900.123", "a@example.com", "", "", "", [ResumeSections.Experience])));
        Assert.Empty(ResumeRules.Validate(new ResumeSettingsRequest(null, null, null, null, null, [])));
    }

    [Fact]
    public void Each_bad_field_gets_an_error()
    {
        var errors = ResumeRules.Validate(new ResumeSettingsRequest("call me", "nope", new string('h', 151), new string('l', 101), new string('s', 1501), ["map"], [" "]));

        Assert.Equal(["email", "excludedSkills", "headline", "location", "phone", "sections", "summary"], errors.Keys.Order());
    }

    [Fact]
    public void Normalize_trims_and_puts_sections_in_print_order_once()
    {
        var normalized = ResumeRules.Normalize(new ResumeSettingsRequest(" 0123 ", null, " Engineer ", null, null, [ResumeSections.Skills, ResumeSections.Experience, ResumeSections.Skills], [" Cobol ", "cobol"]));

        Assert.Equal("0123", normalized.Phone);
        Assert.Equal("", normalized.Email);
        Assert.Equal("Engineer", normalized.Headline);
        Assert.Equal([ResumeSections.Experience, ResumeSections.Skills], normalized.Sections);
        Assert.Equal(["Cobol"], normalized.ExcludedSkills);
    }
}
