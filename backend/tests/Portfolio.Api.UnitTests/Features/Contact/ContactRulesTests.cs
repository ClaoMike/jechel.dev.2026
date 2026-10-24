using Portfolio.Api.Features.Contact;

namespace Portfolio.Api.UnitTests.Features.Contact;

public class ContactRulesTests
{
    private static readonly string ValidMessage = new('a', ContactRules.MessageMinLength);

    private static SendMessageRequest Valid() => new("Ada Lovelace", "ada@example.com", ValidMessage);

    [Fact]
    public void A_complete_request_is_valid()
    {
        Assert.Empty(ContactRules.Validate(Valid()));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("project")]
    public void A_message_is_about_anything_or_a_project(string? topic)
    {
        Assert.Empty(ContactRules.Validate(Valid() with { Topic = topic }));
    }

    [Theory]
    [InlineData("Project")]
    [InlineData("job")]
    [InlineData(" project")]
    public void Any_other_topic_is_refused(string topic)
    {
        var errors = ContactRules.Validate(Valid() with { Topic = topic });

        Assert.Equal(["Pick what the message is about."], errors["topic"]);
    }

    [Fact]
    public void Missing_fields_are_all_reported()
    {
        var errors = ContactRules.Validate(new SendMessageRequest(null, null, null));

        Assert.Equal(["email", "message", "name"], errors.Keys.Order());
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Name_is_required(string name)
    {
        var errors = ContactRules.Validate(Valid() with { Name = name });

        Assert.Equal(["Name is required."], errors["name"]);
    }

    [Fact]
    public void Name_has_a_maximum_length()
    {
        Assert.Empty(ContactRules.Validate(Valid() with { Name = new string('n', ContactRules.NameMaxLength) }));
        Assert.Contains("name", ContactRules.Validate(Valid() with { Name = new string('n', ContactRules.NameMaxLength + 1) }).Keys);
    }

    [Theory]
    [InlineData("ada@example.com", true)]
    [InlineData("ada.lovelace+site@mail.example.co.uk", true)]
    [InlineData("ada", false)]
    [InlineData("ada@", false)]
    [InlineData("@example.com", false)]
    [InlineData("ada@localhost", false)]
    [InlineData("ada@example.", false)]
    [InlineData("Ada <ada@example.com>", false)]
    [InlineData("ada@example.com, bob@example.com", false)]
    public void Email_must_be_a_single_plain_address(string email, bool valid)
    {
        var errors = ContactRules.Validate(Valid() with { Email = email });

        Assert.Equal(valid, !errors.ContainsKey("email"));
    }

    [Fact]
    public void Email_has_a_maximum_length()
    {
        var tooLong = new string('a', ContactRules.EmailMaxLength - "@example.com".Length + 1) + "@example.com";

        Assert.Contains("email", ContactRules.Validate(Valid() with { Email = tooLong }).Keys);
    }

    [Theory]
    [InlineData(ContactRules.MessageMinLength - 1, "Message must be at least 100 characters.")]
    [InlineData(ContactRules.MessageMinLength, null)]
    [InlineData(ContactRules.MessageMaxLength, null)]
    [InlineData(ContactRules.MessageMaxLength + 1, "Message must be at most 1000 characters.")]
    public void Message_must_be_between_100_and_1000_characters(int length, string? error)
    {
        var errors = ContactRules.Validate(Valid() with { Message = new string('m', length) });

        if (error is null)
            Assert.False(errors.ContainsKey("message"));
        else
            Assert.Equal([error], errors["message"]);
    }

    [Fact]
    public void Message_length_is_counted_without_surrounding_whitespace()
    {
        var padded = "   " + new string('m', ContactRules.MessageMinLength - 1) + "\n\n";

        Assert.Contains("message", ContactRules.Validate(Valid() with { Message = padded }).Keys);
    }
}
