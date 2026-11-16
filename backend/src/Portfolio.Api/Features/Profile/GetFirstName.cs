using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Profile;

public sealed class GetFirstName : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGet("/firstname", Handle).WithName("GetFirstName");

    public static async Task<Results<Ok<FirstNameResponse>, NotFound>> Handle(
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

public record FirstNameResponse(string FirstName);
