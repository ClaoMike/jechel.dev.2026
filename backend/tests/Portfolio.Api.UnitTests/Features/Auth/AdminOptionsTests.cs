using Portfolio.Api.Features.Auth;

namespace Portfolio.Api.UnitTests.Features.Auth;

public class AdminOptionsTests
{
    private readonly AdminOptions _options = new() { AdminEmails = ["admin@example.com"] };

    [Theory]
    [InlineData("admin@example.com")]
    [InlineData("ADMIN@example.com")]
    [InlineData(" admin@example.com ")]
    public void Allows_configured_admin_email(string email) =>
        Assert.True(_options.IsAdmin(email));

    [Theory]
    [InlineData("someone@example.com")]
    [InlineData("")]
    [InlineData(null)]
    public void Rejects_other_or_missing_email(string? email) =>
        Assert.False(_options.IsAdmin(email));

    [Fact]
    public void Rejects_everyone_when_no_admins_configured() =>
        Assert.False(new AdminOptions().IsAdmin("admin@example.com"));
}
