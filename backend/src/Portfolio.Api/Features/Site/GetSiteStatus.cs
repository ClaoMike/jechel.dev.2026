using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Caching.Hybrid;
using Portfolio.Api.Common;
using static Portfolio.Api.Features.Site.SiteShared;

namespace Portfolio.Api.Features.Site;

public sealed class GetSiteStatus : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/site").MapGet("/", Handle).WithName("GetSiteStatus");

    public static async Task<Ok<SiteStatus>> Handle(HybridCache cache, IServiceProvider services, HttpContext http, CancellationToken cancellationToken)
    {
        // Short, so a change in Settings reaches visitors quickly (the API's own cache is cleared at once).
        http.Response.Headers.CacheControl = "public, max-age=30";
        return TypedResults.Ok(await LoadAsync(cache, services, cancellationToken));
    }
}
