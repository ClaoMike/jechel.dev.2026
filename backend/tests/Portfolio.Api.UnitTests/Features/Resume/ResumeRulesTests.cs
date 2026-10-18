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
}
