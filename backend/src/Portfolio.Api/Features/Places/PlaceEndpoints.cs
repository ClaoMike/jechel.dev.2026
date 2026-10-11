using Microsoft.AspNetCore.Http.HttpResults;

namespace Portfolio.Api.Features.Places;

public static class PlaceEndpoints
{
    public static IEndpointRouteBuilder MapPlaceEndpoints(this IEndpointRouteBuilder app)
    {
        var places = app.MapGroup("/places");

        // Admin only: used while adding a place to the "Where I've been" map.
        places.MapGet("/search", Search).WithName("SearchCities").RequireAuthorization();

        return app;
    }

    /// <summary>Up to <paramref name="limit"/> places whose name starts with <paramref name="q"/>, largest first.</summary>
    public static Ok<IReadOnlyList<City>> Search(CityIndex cities, string? q, int limit = 10) =>
        TypedResults.Ok(cities.Search(q, limit));
}
