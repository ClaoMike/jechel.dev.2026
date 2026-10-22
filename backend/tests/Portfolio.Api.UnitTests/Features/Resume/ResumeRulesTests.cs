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
}
