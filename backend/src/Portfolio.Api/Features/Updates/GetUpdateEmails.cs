using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Updates.UpdateEmailsShared;

namespace Portfolio.Api.Features.Updates;

public sealed class GetUpdateEmails : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/updates/emails").RequireAuthorization().MapGet("/", Handle).WithName("GetUpdateEmails");

    public static async Task<Ok<UpdateEmailsDocument>> Handle(PortfolioDbContext db, CancellationToken cancellationToken) =>
        TypedResults.Ok(await LoadDocumentAsync(db, cancellationToken));
}
