namespace Portfolio.Api.IntegrationTests;

/// <summary>Shares one API + PostgreSQL container across all integration test classes.</summary>
[CollectionDefinition(Name)]
public class ApiCollection : ICollectionFixture<PortfolioApiFactory>
{
    public const string Name = "Api";
}
