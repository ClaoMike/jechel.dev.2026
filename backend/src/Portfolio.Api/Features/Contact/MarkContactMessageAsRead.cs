using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Contact;

/// <summary>Idempotent: keeps the time it was first read.</summary>
public sealed class MarkContactMessageAsRead : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/contact").MapGroup("/messages").RequireAuthorization().MapPost("/{id:int}/read", Handle).WithName("MarkContactMessageAsRead");

    public static async Task<Results<NoContent, NotFound>> Handle(
        int id,
        PortfolioDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var message = await db.ContactMessages.FindAsync([id], cancellationToken);
        if (message is null)
        {
            return TypedResults.NotFound();
        }

        if (message.ReadAt is null)
        {
            message.ReadAt = time.GetUtcNow();
            await db.SaveChangesAsync(cancellationToken);
        }

        return TypedResults.NoContent();
    }
}
