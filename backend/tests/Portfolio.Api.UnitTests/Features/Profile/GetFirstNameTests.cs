using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Profile;

namespace Portfolio.Api.UnitTests.Features.Profile;

public class GetFirstNameTests
{
    private static PortfolioDbContext CreateDbContext() =>
        new(new DbContextOptionsBuilder<PortfolioDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    [Fact]
    public async Task Returns_first_name_when_profile_exists()
    {
        await using var db = CreateDbContext();
        db.Profiles.Add(new Data.Profile { Id = 1, FirstName = "Claudiu" });
        await db.SaveChangesAsync();

        var result = await ProfileEndpoints.GetFirstName(db, CancellationToken.None);

        var ok = Assert.IsType<Ok<FirstNameResponse>>(result.Result);
        Assert.Equal("Claudiu", ok.Value!.FirstName);
    }

    [Fact]
    public async Task Returns_not_found_when_no_profile_exists()
    {
        await using var db = CreateDbContext();

        var result = await ProfileEndpoints.GetFirstName(db, CancellationToken.None);

        Assert.IsType<NotFound>(result.Result);
    }
}
