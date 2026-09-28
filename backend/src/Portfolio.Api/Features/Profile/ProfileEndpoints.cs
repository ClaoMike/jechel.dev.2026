using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Profile;

public record FirstNameResponse(string FirstName);

public static class ProfileEndpoints
{
    public static IEndpointRouteBuilder MapProfileEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/firstname", GetFirstName)
            .WithName("GetFirstName");

        return app;
    }

    public static async Task<Results<Ok<FirstNameResponse>, NotFound>> GetFirstName(
        PortfolioDbContext db,
        CancellationToken cancellationToken)
    {
        var firstName = await db.Profiles
            .AsNoTracking()
            .OrderBy(p => p.Id)
            .Select(p => p.FirstName)
            .FirstOrDefaultAsync(cancellationToken);

        return firstName is null
            ? TypedResults.NotFound()
            : TypedResults.Ok(new FirstNameResponse(firstName));
    }
}
