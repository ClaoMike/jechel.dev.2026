using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using __NAMESPACE__.Api.Common;
using __NAMESPACE__.Api.Data;

namespace __NAMESPACE__.Api.Features.Greetings;

/// <summary>Public. The first greeting, for the home page.</summary>
public sealed class GetGreeting : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGet("/greeting", Handle).WithName("GetGreeting");

    public static async Task<Ok<GreetingResponse>> Handle(AppDbContext db, CancellationToken cancellationToken)
    {
        var text = await db.Greetings.AsNoTracking().OrderBy(g => g.Id).Select(g => g.Text).FirstOrDefaultAsync(cancellationToken);
        return TypedResults.Ok(new GreetingResponse(text ?? "Hello"));
    }
}

public record GreetingResponse(string Text);
