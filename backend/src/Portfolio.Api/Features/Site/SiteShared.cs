using System.Text.Json;
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

    /// <param>
    /// coffee: "Buy me a coffee" (header); updates: "Get updates" (header); workWithMe: "Work with me" (what I offer, and
    /// "A project" on the contact form). Meetings are by invitation only: no switch.
    /// </param>
    public static readonly IReadOnlyList<string> Features = ["coffee", "updates", "workWithMe"];

    /// <summary>Off until the admin switches them on, whatever <see cref="SiteOptions.PagesVisibleByDefault"/> says: newer features, tried first in Feature Testing.</summary>
    public static readonly IReadOnlyList<string> OffUntilSwitchedOn = ["workWithMe"];
}

/// <summary>What visitors see, as the API answers it: every page and feature, each on or off.</summary>
/// <param name="Maintenance">On: visitors get the maintenance screen (the signed-in admin still sees the site).</param>
public record SiteStatus(IReadOnlyDictionary<string, bool> Pages, IReadOnlyDictionary<string, bool> Features, bool Maintenance, string MaintenanceMessage, DateTimeOffset? UpdatedAt);

/// <param name="Pages">Only known ids; missing ones keep their current value.</param>
public record SaveSiteRequest(IReadOnlyDictionary<string, bool>? Pages, IReadOnlyDictionary<string, bool>? Features, bool? Maintenance, string? MaintenanceMessage);

public static class SiteShared
{
    public const string CacheKey = "site-status";
    public const int MessageMaxLength = 300;

    internal static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;
    internal static readonly HybridCacheEntryOptions CacheFor = new() { Expiration = TimeSpan.FromMinutes(5), LocalCacheExpiration = TimeSpan.FromMinutes(1) };

    /// <summary>The status, from the cache when it's there.</summary>
    public static ValueTask<SiteStatus> LoadAsync(HybridCache cache, IServiceProvider services, CancellationToken cancellationToken) =>
        cache.GetOrCreateAsync(CacheKey, async token =>
        {
            using var scope = services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<PortfolioDbContext>();
            var visibleByDefault = scope.ServiceProvider.GetRequiredService<IOptions<SiteOptions>>().Value.PagesVisibleByDefault;
            return ToStatus(await db.SiteStates.FindAsync([SiteState.SingletonId], token), visibleByDefault);
        }, CacheFor, cancellationToken: cancellationToken);

    internal static Dictionary<string, bool> Merge(IReadOnlyDictionary<string, bool> current, IReadOnlyDictionary<string, bool>? changes) =>
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
            SiteParts.Features.ToDictionary(f => f, f => features.TryGetValue(f, out var on) ? on : visibleByDefault && !SiteParts.OffUntilSwitchedOn.Contains(f)),
            row?.MaintenanceEnabled ?? false,
            row?.MaintenanceMessage ?? "",
            row?.UpdatedAt);
    }

    internal static Dictionary<string, bool> Read(string? json)
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
