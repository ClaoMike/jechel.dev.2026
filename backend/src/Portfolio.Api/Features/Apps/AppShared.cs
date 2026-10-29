using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Apps;

public static class AppShared
{
    public const int DefaultPageSize = 9;
    public const int MaxPageSize = 50;

    internal static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;

    internal static async Task<IReadOnlyList<AppOrderItem>> LoadOrderAsync(PortfolioDbContext db, CancellationToken cancellationToken) =>
        await db.Apps
            .AsNoTracking()
            .InOrder()
            .Select(a => new AppOrderItem(a.Id, a.Title, a.ShowInWhatsNew))
            .ToListAsync(cancellationToken);

    /// <summary>The admin's order; apps at the same place (none yet saved) newest first.</summary>
    public static IOrderedQueryable<AppEntry> InOrder(this IQueryable<AppEntry> apps) =>
        apps.OrderBy(a => a.Position).ThenByDescending(a => a.CreatedAt).ThenByDescending(a => a.Id);

    internal static async Task<IReadOnlyList<AppCategoryDto>> LoadCategoriesAsync(PortfolioDbContext db, CancellationToken cancellationToken) =>
        await db.AppCategories
            .AsNoTracking()
            .OrderBy(c => c.Position)
            .ThenBy(c => c.Id)
            .Select(c => new AppCategoryDto(c.Id, c.Name))
            .ToListAsync(cancellationToken);

    /// <summary>Trimmed; call only with a request that passed <see cref="AppRules.Validate"/>.</summary>
    internal static void Apply(AppEntry entry, AppRequest request, TimeProvider time)
    {
        entry.Title = request.Title!.Trim();
        entry.Description = request.Description?.Trim() ?? "";
        entry.Media = JsonSerializer.Serialize(request.Media!.Select(m => new AppMedia(
            m!.Kind == AppMediaKinds.YouTube ? YouTubeLinks.WatchUrl(YouTubeLinks.VideoIdIn(m.Url)!) : m.Url.Trim(),
            m.Kind)), Json);
        entry.CategoryIds = JsonSerializer.Serialize(request.CategoryIds ?? [], Json);
        entry.Platforms = JsonSerializer.Serialize((request.Platforms ?? []).Select(p => p!.Trim()), Json);
        entry.Links = JsonSerializer.Serialize((request.Links ?? []).Select(l => new AppLink(l!.Label.Trim(), l.Url.Trim())), Json);
        if (request.ShowInWhatsNew is { } show) entry.ShowInWhatsNew = show;
        entry.UpdatedAt = time.GetUtcNow();
    }

    /// <summary>Its categories in the categories' order; ids of deleted ones are skipped.</summary>
    internal static AppDetails ToDetails(AppEntry entry, IReadOnlyList<AppCategoryDto> categories)
    {
        var ids = JsonSerializer.Deserialize<int[]>(entry.CategoryIds, Json) ?? [];
        return new(
            entry.Id,
            entry.Title,
            entry.Description,
            [.. categories.Where(c => ids.Contains(c.Id))],
            JsonSerializer.Deserialize<string[]>(entry.Platforms, Json) ?? [],
            JsonSerializer.Deserialize<AppLink[]>(entry.Links, Json) ?? [],
            JsonSerializer.Deserialize<AppMedia[]>(entry.Media, Json) ?? [],
            entry.CreatedAt,
            entry.ShowInWhatsNew);
    }
}
