using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Analytics;

/// <summary>Deletes the visit and its events, e.g. your own test visits.</summary>
public sealed class DeleteVisitSession : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/analytics").MapGroup("/sessions").RequireAuthorization().MapDelete("/{id:guid}", Handle).WithName("DeleteVisitSession");

    public static async Task<Results<NoContent, NotFound>> Handle(
        Guid id,
        PortfolioDbContext db,
        CancellationToken cancellationToken)
    {
        var session = await db.VisitSessions.FindAsync([id], cancellationToken);
        if (session is null) return TypedResults.NotFound();

        db.VisitSessions.Remove(session);
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }
}
