using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Files;

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

        apps.MapGet("/categories", ListCategories).WithName("ListAppCategories");
        apps.MapPut("/categories", SaveCategories).WithName("SaveAppCategories").RequireAuthorization();

        return app;
    }

    /// <summary>Public. Newest first.</summary>
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
            .OrderByDescending(a => a.CreatedAt)
            .ThenByDescending(a => a.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);
        var categories = await LoadCategoriesAsync(db, cancellationToken);

        return TypedResults.Ok(new PagedResponse<AppDetails>([.. rows.Select(r => ToDetails(r, categories))], page, pageSize, totalCount));
    }

    /// <summary>Admin only.</summary>
    public static async Task<Results<Created<AppDetails>, ValidationProblem>> CreateApp(
        AppRequest request,
        PortfolioDbContext db,
        IFileStorage files,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var categories = await LoadCategoriesAsync(db, cancellationToken);
        var errors = AppRules.Validate(request, [.. categories.Select(c => c.Id)]);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var entry = new AppEntry { Title = "", Description = "", Media = "[]", CreatedAt = time.GetUtcNow() };
        Apply(entry, request, time);
        db.Apps.Add(entry);
        await db.SaveChangesAsync(cancellationToken);
        await FileCleanup.DeleteUnusedAsync(db, files, time, cancellationToken);

        return TypedResults.Created($"/api/apps/{entry.Id}", ToDetails(entry, categories));
    }

    /// <summary>Admin only. Replaces everything about the app but when it was added.</summary>
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

    /// <summary>Admin only. Its images and videos are deleted with the next cleanup, a day later.</summary>
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
        await db.SaveChangesAsync(cancellationToken);
        await FileCleanup.DeleteUnusedAsync(db, files, time, cancellationToken);

        return TypedResults.NoContent();
    }

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
            entry.CreatedAt);
    }
}
