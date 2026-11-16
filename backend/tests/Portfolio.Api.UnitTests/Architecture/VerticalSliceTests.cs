using System.Reflection;
using Microsoft.EntityFrameworkCore;
using NetArchTest.Rules;
using Portfolio.Api.Common;
using Portfolio.Api.Data;

namespace Portfolio.Api.UnitTests.Architecture;

/// <summary>
/// The API's vertical slice architecture, checked on every test run so it stays that way: every endpoint is a slice of
/// its feature (Features/&lt;Feature&gt;/&lt;Endpoint&gt;.cs, an <see cref="IEndpoint"/>), slices never use each other
/// (what two of them share lives in the feature, beside them), every table belongs to one feature, and Common, the
/// shared kernel, knows no feature.
/// </summary>
public class VerticalSliceTests
{
    private static readonly Assembly Api = typeof(IEndpoint).Assembly;
    private const string Features = "Portfolio.Api.Features";

    private static readonly IReadOnlyList<Type> Slices = EndpointDiscovery.Slices(Api);

    public static TheoryData<string> SliceNames => [.. Slices.Select(s => s.FullName!)];

    [Fact]
    public void Every_endpoint_is_a_slice()
    {
        Assert.True(Slices.Count > 0);
        // The old way: a class of a feature's endpoints, mapped by hand.
        var endpointClasses = Types.InAssembly(Api).That().HaveNameEndingWith("Endpoints").GetTypes().Select(t => t.FullName);
        Assert.Empty(endpointClasses);
    }

    [Theory]
    [MemberData(nameof(SliceNames))]
    public void A_slice_lives_in_its_feature_and_is_sealed(string name)
    {
        var slice = Slices.Single(s => s.FullName == name);

        Assert.True(slice.IsSealed, $"{name} should be sealed");
        Assert.Matches(@"^Portfolio\.Api\.Features\.\w+$", slice.Namespace);
    }

    [Theory]
    [MemberData(nameof(SliceNames))]
    public void Nothing_uses_a_slice(string name)
    {
        // Not another slice (they share through their feature's types instead), not a service, not the DbContext: the app
        // only finds it (EndpointDiscovery). Its own nested types (lambdas, async state machines) are part of it.
        var users = Types.InAssembly(Api).That().HaveDependencyOn(name).GetTypes()
            .Select(t => t.FullName!)
            .Where(t => t != name && !t.StartsWith(name + "+", StringComparison.Ordinal) && !t.StartsWith(name + "/", StringComparison.Ordinal));

        Assert.Empty(users);
    }

    [Fact]
    public void Common_knows_no_feature()
    {
        var result = Types.InAssembly(Api).That().ResideInNamespace("Portfolio.Api.Common")
            .ShouldNot().HaveDependencyOnAny(Features, "Portfolio.Api.Data")
            .GetResult();

        Assert.True(result.IsSuccessful, string.Join(", ", result.FailingTypeNames ?? []));
    }

    [Fact]
    public void Features_dont_depend_on_the_host()
    {
        var result = Types.InAssembly(Api).That().ResideInNamespace(Features)
            .ShouldNot().HaveDependencyOn("Program")
            .GetResult();

        Assert.True(result.IsSuccessful, string.Join(", ", result.FailingTypeNames ?? []));
    }

    [Fact]
    public void Every_table_belongs_to_one_feature_and_is_mapped_there()
    {
        using var db = Context();
        var entities = db.Model.GetEntityTypes().Select(e => e.ClrType).Where(t => t.Assembly == Api).ToList();
        var configurations = Api.GetTypes()
            .SelectMany(t => t.GetInterfaces().Where(i => i.IsGenericType && i.GetGenericTypeDefinition() == typeof(IEntityTypeConfiguration<>)).Select(i => (Configuration: t, Entity: i.GetGenericArguments()[0])))
            .ToList();

        Assert.NotEmpty(entities);
        Assert.All(entities, entity =>
        {
            Assert.Matches(@"^Portfolio\.Api\.Features\.\w+$", entity.Namespace);
            var mapping = Assert.Single(configurations, c => c.Entity == entity);
            Assert.Equal(entity.Namespace, mapping.Configuration.Namespace);
        });
    }

    [Fact]
    public void The_model_matches_the_migrations()
    {
        using var db = Context();

        Assert.False(db.Database.HasPendingModelChanges(), "The model changed without a migration: dotnet ef migrations add <Name>");
    }

    private static PortfolioDbContext Context() =>
        new(new DbContextOptionsBuilder<PortfolioDbContext>().UseNpgsql("Host=unused").Options);
}
