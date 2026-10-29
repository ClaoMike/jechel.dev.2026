using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Contact;

/// <summary>Deletes the message for good.</summary>
public sealed class DeleteContactMessage : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/contact").MapGroup("/messages").RequireAuthorization().MapDelete("/{id:int}", Handle).WithName("DeleteContactMessage");

    public static async Task<Results<NoContent, NotFound>> Handle(
        int id,
        PortfolioDbContext db,
        CancellationToken cancellationToken)
    {
        var message = await db.ContactMessages.FindAsync([id], cancellationToken);
        if (message is null)
        {
            return TypedResults.NotFound();
        }

        db.ContactMessages.Remove(message);
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }
}
