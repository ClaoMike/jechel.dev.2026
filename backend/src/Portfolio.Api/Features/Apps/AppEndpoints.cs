using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Files;
using Portfolio.Api.Features.Updates;

namespace Portfolio.Api.Features.Apps;

public static class AppEndpoints
{
    public const int DefaultPageSize = 9;
    public const int MaxPageSize = 50;

    private static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;

    public static IEndpointRouteBuilder MapAppEndpoints(this IEndpointRouteBuilder app)
    {
        var apps = app.MapGroup("/apps");

        apps.MapGet("/", ListApps).WithName("ListApps");
        apps.MapPost("/", CreateApp).WithName("CreateApp").RequireAuthorization();
        apps.MapPut("/{id:int}", UpdateApp).WithName("UpdateApp").RequireAuthorization();
        apps.MapDelete("/{id:int}", DeleteApp).WithName("DeleteApp").RequireAuthorization();

        apps.MapGet("/order", ListOrder).WithName("ListAppOrder").RequireAuthorization();
        apps.MapPut("/order", SaveOrder).WithName("SaveAppOrder").RequireAuthorization();
        apps.MapGet("/whats-new", GetWhatsNew).WithName("GetWhatsNewApp");

        apps.MapGet("/categories", ListCategories).WithName("ListAppCategories");
        apps.MapPut("/categories", SaveCategories).WithName("SaveAppCategories").RequireAuthorization();

        return app;
    }

    /// <summary>Public. In the admin's order (Organise); a new app goes first.</summary>
    public static async Task<Ok<PagedResponse<AppDetails>>> ListApps(
        PortfolioDbContext db,
        CancellationToken cancellationToken,
        int page = 1,
        int pageSize = DefaultPageSize)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var totalCount = await db.Apps.CountAsync(cancellationToken);
        var rows = await db.Apps
            .AsNoTracking()
            .InOrder()
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);
        var categories = await LoadCategoriesAsync(db, cancellationToken);

        return TypedResults.Ok(new PagedResponse<AppDetails>([.. rows.Select(r => ToDetails(r, categories))], page, pageSize, totalCount));
    }

    /// <summary>Admin only. It goes first in the order. Then asks the admin's phone whether to email the subscribers about it.</summary>
    public static async Task<Results<Created<AppDetails>, ValidationProblem>> CreateApp(
        AppRequest request,
        PortfolioDbContext db,
        IFileStorage files,
        IPhoneAlerts alerts,
        IOptions<SiteOptions> site,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var categories = await LoadCategoriesAsync(db, cancellationToken);
        var errors = AppRules.Validate(request, [.. categories.Select(c => c.Id)]);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        // Before the first: the others keep their places (and numbers) until the admin saves an order.
        var first = await db.Apps.MinAsync(a => (int?)a.Position, cancellationToken);
        var entry = new AppEntry { Title = "", Description = "", Media = "[]", CreatedAt = time.GetUtcNow(), Position = (first ?? 1) - 1 };
        Apply(entry, request, time);
        db.Apps.Add(entry);
        await db.SaveChangesAsync(cancellationToken);
        await FileCleanup.DeleteUnusedAsync(db, files, time, cancellationToken);
        await AnnouncementDecisions.ProposeAppAsync(entry, db, alerts, site.Value, time, cancellationToken);

        return TypedResults.Created($"/api/apps/{entry.Id}", ToDetails(entry, categories));
    }

    /// <summary>Admin only. Replaces everything about the app but when it was added and its place in the order.</summary>
    public static async Task<Results<Ok<AppDetails>, NotFound, ValidationProblem>> UpdateApp(
        int id,
        AppRequest request,
        PortfolioDbContext db,
        IFileStorage files,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var categories = await LoadCategoriesAsync(db, cancellationToken);
        var errors = AppRules.Validate(request, [.. categories.Select(c => c.Id)]);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var entry = await db.Apps.FindAsync([id], cancellationToken);
        if (entry is null) return TypedResults.NotFound();

        Apply(entry, request, time);
        await db.SaveChangesAsync(cancellationToken);
        await FileCleanup.DeleteUnusedAsync(db, files, time, cancellationToken);

        return TypedResults.Ok(ToDetails(entry, categories));
    }

    /// <summary>
    /// Admin only. Its images and videos are deleted with the next cleanup, a day later. An email about it that hasn't
    /// gone out (waiting for the admin, or about to be sent) won't: it's marked not sent.
    /// </summary>
    public static async Task<Results<NoContent, NotFound>> DeleteApp(
        int id,
        PortfolioDbContext db,
        IFileStorage files,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var entry = await db.Apps.FindAsync([id], cancellationToken);
        if (entry is null) return TypedResults.NotFound();

        db.Apps.Remove(entry);
        var key = id.ToString();
        foreach (var announcement in await db.Announcements
            .Where(a => a.Kind == UpdatesAnnouncer.AppKind && a.ItemKey == key && (a.Status == AnnouncementStatus.Pending || a.Status == AnnouncementStatus.Approved))
            .ToListAsync(cancellationToken))
        {
            announcement.Status = AnnouncementStatus.Ignored;
            announcement.DecisionTokenHash = null;
        }
        await db.SaveChangesAsync(cancellationToken);
        await FileCleanup.DeleteUnusedAsync(db, files, time, cancellationToken);

        return TypedResults.NoContent();
    }

    /// <summary>Admin only. Every app, in the order (Organise): its name, and whether What's new? may show it.</summary>
    public static async Task<Ok<IReadOnlyList<AppOrderItem>>> ListOrder(PortfolioDbContext db, CancellationToken cancellationToken) =>
        TypedResults.Ok(await LoadOrderAsync(db, cancellationToken));

    /// <summary>
    /// Admin only. Saves the order (every app, each once, top first) and which apps What's new? may show.
    /// Positions are numbered afresh from 0.
    /// </summary>
    public static async Task<Results<Ok<IReadOnlyList<AppOrderItem>>, ValidationProblem>> SaveOrder(
        IReadOnlyList<AppOrderRequest?> request,
        PortfolioDbContext db,
        CancellationToken cancellationToken)
    {
        var apps = await db.Apps.ToDictionaryAsync(a => a.Id, cancellationToken);
        var errors = AppRules.ValidateOrder(request, apps.Keys);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        for (var i = 0; i < request.Count; i++)
        {
            var app = apps[request[i]!.Id!.Value];
            app.Position = i;
            app.ShowInWhatsNew = request[i]!.ShowInWhatsNew!.Value;
        }
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            // An app was deleted after the check above (another tab): out of date, as if it had been gone already.
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { [""] = [AppRules.OrderOutOfDate] });
        }
        return TypedResults.Ok(await LoadOrderAsync(db, cancellationToken));
    }

    /// <summary>Public. The first app in the order that What's new? may show, or none.</summary>
    public static async Task<Ok<WhatsNewApp>> GetWhatsNew(PortfolioDbContext db, CancellationToken cancellationToken)
    {
        var entry = await db.Apps.AsNoTracking().Where(a => a.ShowInWhatsNew).InOrder().FirstOrDefaultAsync(cancellationToken);
        if (entry is null) return TypedResults.Ok(new WhatsNewApp(null));
        return TypedResults.Ok(new WhatsNewApp(ToDetails(entry, await LoadCategoriesAsync(db, cancellationToken))));
    }

    private static async Task<IReadOnlyList<AppOrderItem>> LoadOrderAsync(PortfolioDbContext db, CancellationToken cancellationToken) =>
        await db.Apps
            .AsNoTracking()
            .InOrder()
            .Select(a => new AppOrderItem(a.Id, a.Title, a.ShowInWhatsNew))
            .ToListAsync(cancellationToken);

    /// <summary>The admin's order; apps at the same place (none yet saved) newest first.</summary>
    public static IOrderedQueryable<AppEntry> InOrder(this IQueryable<AppEntry> apps) =>
        apps.OrderBy(a => a.Position).ThenByDescending(a => a.CreatedAt).ThenByDescending(a => a.Id);

    /// <summary>Public. In the admin's order.</summary>
    public static async Task<Ok<IReadOnlyList<AppCategoryDto>>> ListCategories(PortfolioDbContext db, CancellationToken cancellationToken) =>
        TypedResults.Ok(await LoadCategoriesAsync(db, cancellationToken));

    /// <summary>
    /// Admin only. Replaces the list: categories with an id are renamed and reordered, those
    /// without are added, and those left out are deleted (and taken off every app).
    /// </summary>
    public static async Task<Results<Ok<IReadOnlyList<AppCategoryDto>>, ValidationProblem>> SaveCategories(
        IReadOnlyList<AppCategoryRequest?> request,
        PortfolioDbContext db,
        CancellationToken cancellationToken)
    {
        var existing = await db.AppCategories.ToListAsync(cancellationToken);
        var errors = AppRules.ValidateCategories(request, [.. existing.Select(c => c.Id)]);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var kept = request.Where(c => c!.Id is not null).Select(c => c!.Id!.Value).ToHashSet();
        var removed = existing.Where(c => !kept.Contains(c.Id)).ToList();
        db.AppCategories.RemoveRange(removed);
        for (var i = 0; i < request.Count; i++)
        {
            var item = request[i]!;
            var category = item.Id is { } id ? existing.Single(c => c.Id == id) : db.AppCategories.Add(new AppCategory { Name = "" }).Entity;
            category.Name = item.Name!.Trim();
            category.Position = i;
        }

        if (removed.Count > 0)
        {
            var removedIds = removed.Select(c => c.Id).ToHashSet();
            foreach (var app in await db.Apps.ToListAsync(cancellationToken))
            {
                var ids = JsonSerializer.Deserialize<int[]>(app.CategoryIds, Json) ?? [];
                if (ids.Any(removedIds.Contains)) app.CategoryIds = JsonSerializer.Serialize(ids.Where(i => !removedIds.Contains(i)), Json);
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(await LoadCategoriesAsync(db, cancellationToken));
    }

    private static async Task<IReadOnlyList<AppCategoryDto>> LoadCategoriesAsync(PortfolioDbContext db, CancellationToken cancellationToken) =>
        await db.AppCategories
            .AsNoTracking()
            .OrderBy(c => c.Position)
            .ThenBy(c => c.Id)
            .Select(c => new AppCategoryDto(c.Id, c.Name))
            .ToListAsync(cancellationToken);

    /// <summary>Trimmed; call only with a request that passed <see cref="AppRules.Validate"/>.</summary>
    private static void Apply(AppEntry entry, AppRequest request, TimeProvider time)
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
    private static AppDetails ToDetails(AppEntry entry, IReadOnlyList<AppCategoryDto> categories)
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
