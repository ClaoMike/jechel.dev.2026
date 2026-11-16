using Portfolio.Api.Features.Resume;

namespace Portfolio.Api.UnitTests.Features.Resume;

public class ResumeRulesTests
{
    [Fact]
    public void Valid_contact_details_and_choices_have_no_errors()
    {
        Assert.Empty(ResumeRules.Validate(new ResumeContact("+44 (0)7700-900.123", "a@example.com", "Engineer")));
        Assert.Empty(ResumeRules.Validate(new ResumeContact(null, null, null)));
        Assert.Empty(ResumeRules.Validate(new ResumeChoices([ResumeSections.Experience], ["Cobol"])));
    }

    [Fact]
    public void Each_bad_field_gets_an_error()
    {
        Assert.Equal(["email", "headline", "phone"], ResumeRules.Validate(new ResumeContact("call me", "nope", new string('h', 151))).Keys.Order());
        Assert.Equal(["excludedSkills", "sections"], ResumeRules.Validate(new ResumeChoices(["map"], [" "])).Keys.Order());
    }

    [Fact]
    public void Normalize_trims_and_puts_sections_in_print_order_once()
    {
        var contact = ResumeRules.Normalize(new ResumeContact(" 0123 ", null, " Engineer "));
        var choices = ResumeRules.Normalize(new ResumeChoices([ResumeSections.Skills, ResumeSections.Experience, ResumeSections.Skills, "summary"], [" Cobol ", "cobol"]));

        Assert.Equal(("0123", "", "Engineer"), (contact.Phone, contact.Email, contact.Headline));
        Assert.Equal([ResumeSections.Experience, ResumeSections.Skills], choices.Sections);
        Assert.Equal(["Cobol"], choices.ExcludedSkills);
    }

    [Fact]
    public void Missing_contact_fields_count_as_empty()
    {
        var contact = new ResumeContact(null!, null!, null!);

        Assert.Empty(ResumeRules.Validate(contact));
        Assert.Equal(new ResumeContact("", "", ""), ResumeRules.Normalize(contact));
    }

    [Theory]
    [InlineData(" ")]
    [InlineData("")]
    public void A_blank_skill_to_leave_out_is_refused(string skill) =>
        Assert.Contains("excludedSkills", ResumeRules.Validate(new ResumeChoices(ResumeSections.All, [skill])).Keys);

    [Fact]
    public void A_skill_name_too_long_to_be_one_is_refused() =>
        Assert.Contains("excludedSkills", ResumeRules.Validate(new ResumeChoices(ResumeSections.All, [new string('x', 201)])).Keys);

    [Fact]
    public void Too_long_is_refused_even_when_it_looks_right()
    {
        // Each would pass its pattern: only the length is wrong.
        Assert.Equal(["phone"], ResumeRules.Validate(new ResumeContact(new string('7', ResumeRules.PhoneMaxLength + 1), "a@example.com", "Engineer")).Keys);
        Assert.Equal(["email"], ResumeRules.Validate(new ResumeContact("0123", new string('a', 250) + "@example.com", "Engineer")).Keys);
        Assert.Empty(ResumeRules.Validate(new ResumeContact(new string('7', ResumeRules.PhoneMaxLength), "a@example.com", new string('h', ResumeRules.HeadlineMaxLength))));
    }

    [Fact]
    public void More_skills_to_leave_out_than_there_could_be_are_refused()
    {
        string[] Skills(int count) => [.. Enumerable.Range(1, count).Select(i => $"Skill {i}")];

        Assert.Empty(ResumeRules.Validate(new ResumeChoices(ResumeSections.All, Skills(ResumeRules.MaxExcludedSkills))));
        Assert.Equal(["excludedSkills"], ResumeRules.Validate(new ResumeChoices(ResumeSections.All, Skills(ResumeRules.MaxExcludedSkills + 1))).Keys);
    }
}
