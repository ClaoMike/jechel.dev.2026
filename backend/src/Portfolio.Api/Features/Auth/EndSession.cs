using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;

namespace Portfolio.Api.Features.Auth;

/// <summary>Admin only. Signs one device out (this one too, if it's asked: its next request is anonymous).</summary>
public sealed class EndSession : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/auth").MapGroup("/sessions").RequireAuthorization().MapDelete("/{id:guid}", Handle).WithName("EndSession");

    public static async Task<Results<NoContent, NotFound>> Handle(Guid id, AdminSessionService sessions, CancellationToken cancellationToken) =>
        await sessions.EndAsync(id, cancellationToken) ? TypedResults.NoContent() : TypedResults.NotFound();
}
