using Portfolio.Api.Features.Auth;

namespace Portfolio.Api.UnitTests.Features.Auth;

public class AdminOptionsTests
{
    private static readonly AdminOptions ByEmail = new() { AdminEmails = ["admin@example.com"] };
    private static readonly AdminOptions ByEmailAndId = new() { AdminEmails = ["admin@example.com"], AdminGoogleIds = ["1234"] };

    [Theory]
    [InlineData("admin@example.com", true)]
    [InlineData("  ADMIN@Example.com ", true)]
    [InlineData("someone@example.com", false)]
    [InlineData("admin@example.com.evil", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void Lets_in_the_listed_emails_whatever_their_case(string? email, bool admin) =>
        Assert.Equal(admin, ByEmail.IsAdmin(email, googleId: null));

    [Theory]
    [InlineData("admin@example.com", "1234", true)]
    [InlineData("admin@example.com", " 1234 ", true)]
    [InlineData("admin@example.com", "9999", false)]
    [InlineData("admin@example.com", null, false)]
    [InlineData("someone@example.com", "1234", false)]
    public void With_Google_ids_set_needs_the_account_id_too(string email, string? googleId, bool admin) =>
        Assert.Equal(admin, ByEmailAndId.IsAdmin(email, googleId));

    [Fact]
    public void Nobody_is_admin_until_an_email_is_listed() =>
        Assert.False(new AdminOptions().IsAdmin("admin@example.com", "1234"));

    [Fact]
    public void Sessions_last_10_idle_minutes_and_12_hours_at_most_by_default()
    {
        var options = new AdminOptions();
        Assert.Equal((TimeSpan.FromMinutes(10), TimeSpan.FromHours(12)), (options.SessionIdleTimeout, options.SessionMaxLifetime));
    }
}
