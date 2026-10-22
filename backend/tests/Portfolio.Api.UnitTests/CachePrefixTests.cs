namespace Portfolio.Api.UnitTests;

public class CachePrefixTests
{
    [Theory]
    [InlineData("Host=localhost;Port=5433;Database=portfolio;Username=portfolio", "portfolio:portfolio:")]
    [InlineData("Host=localhost;Database=portfolio_e2e", "portfolio:portfolio_e2e:")]
    [InlineData("", "portfolio:default:")]
    [InlineData(null, "portfolio:default:")]
    [InlineData("Host=localhost", "portfolio:default:")]
    [InlineData("Host=db.internal;Port=5432;Database=jechel;Username=portfolio;Password=secret", "portfolio:jechel:")]
    // Not a connection string at all: the default, not a crash at start-up.
    [InlineData("this is not a connection string", "portfolio:default:")]
    [InlineData("Nonsense=1;Database=x", "portfolio:default:")]
    public void Each_database_gets_its_own_keys(string? connectionString, string expected) => Assert.Equal(expected, CachePrefix.For(connectionString));

    [Fact]
    public void The_password_never_ends_up_in_a_key()
    {
        Assert.DoesNotContain("secret", CachePrefix.For("Host=h;Database=portfolio;Password=secret"));
    }

    [Fact]
    public void Two_APIs_on_different_databases_never_share_a_key()
    {
        Assert.NotEqual(CachePrefix.For("Host=h;Database=portfolio"), CachePrefix.For("Host=h;Database=portfolio_e2e"));
        Assert.Equal(CachePrefix.For("Host=a;Database=portfolio"), CachePrefix.For("Host=b;Port=1;Database=portfolio"));
    }
}
