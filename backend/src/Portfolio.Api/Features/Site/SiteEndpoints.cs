using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;

namespace Portfolio.Api.Features.Site;

/// <summary>The visitor pages and features that can be hidden, in the order the Settings tab lists them.</summary>
public static class SiteParts
{
    public static readonly IReadOnlyList<string> Pages = ["whatsNew", "apps", "youtube", "about", "contact"];

    /// <param>coffee: "Buy me a coffee" (header); updates: "Get updates" (header). Meetings are by invitation only: no switch.</param>
    public static readonly IReadOnlyList<string> Features = ["coffee", "updates"];
}

/// <summary>What visitors see, as the API answers it: every page and feature, each on or off.</summary>
/// <param name="Maintenance">On: visitors get the maintenance screen (the signed-in admin still sees the site).</param>
public record SiteStatus(IReadOnlyDictionary<string, bool> Pages, IReadOnlyDictionary<string, bool> Features, bool Maintenance, string MaintenanceMessage, DateTimeOffset? UpdatedAt);

/// <param name="Pages">Only known ids; missing ones keep their current value.</param>
public record SaveSiteRequest(IReadOnlyDictionary<string, bool>? Pages, IReadOnlyDictionary<string, bool>? Features, bool? Maintenance, string? MaintenanceMessage);

public static class SiteEndpoints
{
    public const string CacheKey = "site-status";
    public const int MessageMaxLength = 300;

    private static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;
    private static readonly HybridCacheEntryOptions CacheFor = new() { Expiration = TimeSpan.FromMinutes(5), LocalCacheExpiration = TimeSpan.FromMinutes(1) };

    public static IEndpointRouteBuilder MapSiteEndpoints(this IEndpointRouteBuilder app)
    {
        var site = app.MapGroup("/site");

        // Public: every visitor's browser asks it first. Cached (memory, then Redis when set up).
        site.MapGet("/", GetStatus).WithName("GetSiteStatus");
        site.MapPut("/", SaveStatus).WithName("SaveSiteStatus").RequireAuthorization();

        return app;
    }

    public static async Task<Ok<SiteStatus>> GetStatus(HybridCache cache, IServiceProvider services, HttpContext http, CancellationToken cancellationToken)
    {
        // Short, so a change in Settings reaches visitors quickly (the API's own cache is cleared at once).
        http.Response.Headers.CacheControl = "public, max-age=30";
        return TypedResults.Ok(await LoadAsync(cache, services, cancellationToken));
    }

    /// <summary>The status, from the cache when it's there.</summary>
    public static ValueTask<SiteStatus> LoadAsync(HybridCache cache, IServiceProvider services, CancellationToken cancellationToken) =>
        cache.GetOrCreateAsync(CacheKey, async token =>
        {
            using var scope = services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<PortfolioDbContext>();
            var visibleByDefault = scope.ServiceProvider.GetRequiredService<IOptions<SiteOptions>>().Value.PagesVisibleByDefault;
            return ToStatus(await db.SiteStates.FindAsync([SiteState.SingletonId], token), visibleByDefault);
        }, CacheFor, cancellationToken: cancellationToken);

    /// <summary>Admin only. Changes what's given; the rest stays.</summary>
    public static async Task<Results<Ok<SiteStatus>, ValidationProblem>> SaveStatus(
        SaveSiteRequest request,
        PortfolioDbContext db,
        HybridCache cache,
        IOptions<SiteOptions> options,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.Pages?.Keys.Any(k => !SiteParts.Pages.Contains(k)) == true) errors["pages"] = ["Unknown page."];
        if (request.Features?.Keys.Any(k => !SiteParts.Features.Contains(k)) == true) errors["features"] = ["Unknown feature."];
        if ((request.MaintenanceMessage?.Trim().Length ?? 0) > MessageMaxLength) errors["maintenanceMessage"] = [$"At most {MessageMaxLength} characters."];
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var row = await db.SiteStates.FindAsync([SiteState.SingletonId], cancellationToken);
        if (row is null)
        {
            row = new SiteState { Id = SiteState.SingletonId };
            db.SiteStates.Add(row);
        }
        var current = ToStatus(row, options.Value.PagesVisibleByDefault);
        row.Pages = JsonSerializer.Serialize(Merge(current.Pages, request.Pages), Json);
        row.Features = JsonSerializer.Serialize(Merge(current.Features, request.Features), Json);
        if (request.Maintenance is { } maintenance) row.MaintenanceEnabled = maintenance;
        if (request.MaintenanceMessage is { } message) row.MaintenanceMessage = message.Trim();
        row.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);

        await cache.RemoveAsync(CacheKey, cancellationToken);
        return TypedResults.Ok(ToStatus(row, options.Value.PagesVisibleByDefault));
    }

    private static Dictionary<string, bool> Merge(IReadOnlyDictionary<string, bool> current, IReadOnlyDictionary<string, bool>? changes) =>
        current.ToDictionary(p => p.Key, p => changes?.TryGetValue(p.Key, out var value) == true ? value : p.Value);

    /// <summary>What visitors see now, straight from the database (for work that runs outside a request, or must not be a minute late).</summary>
    public static async Task<SiteStatus> VisibleAsync(PortfolioDbContext db, SiteOptions options, CancellationToken cancellationToken) =>
        ToStatus(await db.SiteStates.AsNoTracking().FirstOrDefaultAsync(s => s.Id == SiteState.SingletonId, cancellationToken), options.PagesVisibleByDefault);

    /// <summary>Every known page and feature, from the row (or the default for those it doesn't have).</summary>
    public static SiteStatus ToStatus(SiteState? row, bool visibleByDefault)
    {
        var pages = Read(row?.Pages);
        var features = Read(row?.Features);
        return new SiteStatus(
            SiteParts.Pages.ToDictionary(p => p, p => pages.TryGetValue(p, out var on) ? on : visibleByDefault),
            SiteParts.Features.ToDictionary(f => f, f => features.TryGetValue(f, out var on) ? on : visibleByDefault),
            row?.MaintenanceEnabled ?? false,
            row?.MaintenanceMessage ?? "",
            row?.UpdatedAt);
    }

    private static Dictionary<string, bool> Read(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, bool>>(json, Json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }
}
