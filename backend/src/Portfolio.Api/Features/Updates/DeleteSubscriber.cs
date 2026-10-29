using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Updates;

/// <summary>Admin only.</summary>
public sealed class DeleteSubscriber : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/updates").MapDelete("/subscribers/{id:int}", Handle).WithName("DeleteSubscriber").RequireAuthorization();

    public static async Task<Results<NoContent, NotFound>> Handle(int id, PortfolioDbContext db, CancellationToken cancellationToken)
    {
        var subscriber = await db.Subscribers.FindAsync([id], cancellationToken);
        if (subscriber is null) return TypedResults.NotFound();

        db.Subscribers.Remove(subscriber);
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }
}
