using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Apps.AppShared;

namespace Portfolio.Api.Features.Apps;

/// <summary>Public. In the admin's order.</summary>
public sealed class ListAppCategories : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/apps").MapGet("/categories", Handle).WithName("ListAppCategories");

    public static async Task<Ok<IReadOnlyList<AppCategoryDto>>> Handle(PortfolioDbContext db, CancellationToken cancellationToken) =>
        TypedResults.Ok(await LoadCategoriesAsync(db, cancellationToken));
}
