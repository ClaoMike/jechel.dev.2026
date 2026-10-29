using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;

namespace Portfolio.Api.Features.Auth;

/// <summary>Admin only. Signs out every device but this one.</summary>
public sealed class EndOtherSessions : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/auth").MapGroup("/sessions").RequireAuthorization().MapPost("/end-others", Handle).WithName("EndOtherSessions");

    public static async Task<Ok<EndedSessions>> Handle(AdminSessionService sessions, CancellationToken cancellationToken) =>
        TypedResults.Ok(new EndedSessions(await sessions.EndOthersAsync(cancellationToken)));
}
