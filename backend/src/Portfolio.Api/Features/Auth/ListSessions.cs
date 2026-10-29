using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;

namespace Portfolio.Api.Features.Auth;

/// <summary>Admin only. Every device signed in, the most recently active first, this one marked.</summary>
public sealed class ListSessions : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/auth").MapGroup("/sessions").RequireAuthorization().MapGet("/", Handle).WithName("ListSessions");

    public static async Task<Ok<IReadOnlyList<AdminSessionInfo>>> Handle(AdminSessionService sessions, CancellationToken cancellationToken) =>
        TypedResults.Ok(await sessions.ListAsync(cancellationToken));
}
