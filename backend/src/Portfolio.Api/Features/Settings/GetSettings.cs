using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Auth;
using static Portfolio.Api.Features.Settings.SettingsShared;

namespace Portfolio.Api.Features.Settings;

public sealed class GetSettings : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/settings").RequireAuthorization().MapGet("/", Handle).WithName("GetSettings");

    public static async Task<Ok<SettingsResponse>> Handle(
        PortfolioDbContext db,
        SettingsStore store,
        IConfiguration configuration,
        IOptionsMonitor<AdminOptions> admins,
        IOptions<SiteOptions> site,
        HttpContext http,
        CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "private, no-store";
        return TypedResults.Ok(await LoadSettingsAsync(db, store, configuration, admins, site, cancellationToken));
    }
}
