using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Updates.UpdatesShared;

namespace Portfolio.Api.Features.Updates;

/// <summary>Deletes the subscriber. Always 204, also for an unknown token, as mail apps expect.</summary>
public sealed class Unsubscribe : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/updates").MapPost("/unsubscribe", Handle).WithName("Unsubscribe");

    public static async Task<NoContent> Handle(string? token, PortfolioDbContext db, CancellationToken cancellationToken)
    {
        var subscriber = await FindAsync(db, token, cancellationToken);
        if (subscriber is not null)
        {
            db.Subscribers.Remove(subscriber);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateConcurrencyException)
            {
                // Two clicks (or a mail app and the page) at once: the other one deleted it.
            }
        }
        return TypedResults.NoContent();
    }
}
