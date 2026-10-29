using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;
using Portfolio.Api.Common;
using Portfolio.Api.Features.Alerts;

namespace Portfolio.Api.Features.Updates;

/// <summary>A GET of the List-Unsubscribe link: sends the browser to the site's page, which unsubscribes (a GET changes nothing).</summary>
public sealed class OpenUnsubscribePage : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/updates").MapGet("/unsubscribe", Handle).WithName("OpenUnsubscribePage");

    public static RedirectHttpResult Handle(string? token, IOptions<SiteOptions> site) =>
        TypedResults.Redirect(site.Value.UrlFor($"/updates/unsubscribe?token={Uri.EscapeDataString(token ?? "")}"));
}
