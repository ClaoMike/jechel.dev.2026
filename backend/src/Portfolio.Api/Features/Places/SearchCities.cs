using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;

namespace Portfolio.Api.Features.Places;

/// <summary>Up to <paramref name="limit"/> places whose name starts with <paramref name="q"/>, largest first.</summary>
public sealed class SearchCities : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/places").MapGet("/search", Handle).WithName("SearchCities").RequireAuthorization();

    public static Ok<IReadOnlyList<City>> Handle(CityIndex cities, string? q, int limit = 10) =>
        TypedResults.Ok(cities.Search(q, limit));
}
