namespace Portfolio.Api.UnitTests;

public class CachePrefixTests
{
    [Theory]
    [InlineData("Host=localhost;Port=5433;Database=portfolio;Username=portfolio", "portfolio:portfolio:")]
    [InlineData("Host=localhost;Database=portfolio_e2e", "portfolio:portfolio_e2e:")]
    [InlineData("", "portfolio:default:")]
    [InlineData(null, "portfolio:default:")]
    public void Each_database_gets_its_own_keys(string? connectionString, string expected) => Assert.Equal(expected, CachePrefix.For(connectionString));
}
