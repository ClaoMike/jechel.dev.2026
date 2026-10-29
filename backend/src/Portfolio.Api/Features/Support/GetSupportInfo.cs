using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;
using Portfolio.Api.Common;
using static Portfolio.Api.Features.Support.SupportShared;

namespace Portfolio.Api.Features.Support;

/// <summary>Public. Where the "Buy me a coffee" button goes, or "" to hide it (no page set, or switched off in Settings).</summary>
public sealed class GetSupportInfo : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/support").MapGet("/", Handle).WithName("GetSupportInfo");

    public static async Task<Ok<SupportInfo>> Handle(IOptionsMonitor<SupportOptions> options, Microsoft.Extensions.Caching.Hybrid.HybridCache cache, IServiceProvider services, CancellationToken cancellationToken)
    {
        var site = await Site.SiteShared.LoadAsync(cache, services, cancellationToken);
        return TypedResults.Ok(new SupportInfo(site.Features["coffee"] ? SafeUrl(options.CurrentValue.Url) : ""));
    }
}
