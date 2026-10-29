using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.About.AboutShared;

namespace Portfolio.Api.Features.About;

/// <summary>Public. The placeholder content until the admin first saves the page.</summary>
public sealed class GetAbout : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/about").MapGet("/", Handle).WithName("GetAbout");

    public static async Task<Ok<AboutContent>> Handle(PortfolioDbContext db, CancellationToken cancellationToken) =>
        TypedResults.Ok(await LoadAsync(db, cancellationToken));
}
