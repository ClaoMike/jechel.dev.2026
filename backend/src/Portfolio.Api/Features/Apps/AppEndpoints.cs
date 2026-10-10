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

    public static IEndpointRouteBuilder MapAppEndpoints(this IEndpointRouteBuilder app)
    {
        var apps = app.MapGroup("/apps");

        apps.MapGet("/", ListApps).WithName("ListApps");
        apps.MapPost("/", CreateApp).WithName("CreateApp").RequireAuthorization();
        apps.MapPut("/{id:int}", UpdateApp).WithName("UpdateApp").RequireAuthorization();
        apps.MapDelete("/{id:int}", DeleteApp).WithName("DeleteApp").RequireAuthorization();

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

        return TypedResults.Ok(new PagedResponse<AppDetails>([.. rows.Select(ToDetails)], page, pageSize, totalCount));
    }

    /// <summary>Admin only.</summary>
    public static async Task<Results<Created<AppDetails>, ValidationProblem>> CreateApp(
        AppRequest request,
        PortfolioDbContext db,
        IFileStorage files,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var errors = AppRules.Validate(request);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var entry = new AppEntry { Title = "", Description = "", Media = "[]", CreatedAt = time.GetUtcNow() };
        Apply(entry, request, time);
        db.Apps.Add(entry);
        await db.SaveChangesAsync(cancellationToken);
        await FileCleanup.DeleteUnusedAsync(db, files, time, cancellationToken);

        return TypedResults.Created($"/api/apps/{entry.Id}", ToDetails(entry));
    }

    /// <summary>Admin only. Replaces the app's title, description and media.</summary>
    public static async Task<Results<Ok<AppDetails>, NotFound, ValidationProblem>> UpdateApp(
        int id,
        AppRequest request,
        PortfolioDbContext db,
        IFileStorage files,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var errors = AppRules.Validate(request);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var entry = await db.Apps.FindAsync([id], cancellationToken);
        if (entry is null) return TypedResults.NotFound();

        Apply(entry, request, time);
        await db.SaveChangesAsync(cancellationToken);
        await FileCleanup.DeleteUnusedAsync(db, files, time, cancellationToken);

        return TypedResults.Ok(ToDetails(entry));
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

    /// <summary>Trimmed; call only with a request that passed <see cref="AppRules.Validate"/>.</summary>
    private static void Apply(AppEntry entry, AppRequest request, TimeProvider time)
    {
        entry.Title = request.Title!.Trim();
        entry.Description = request.Description?.Trim() ?? "";
        entry.Media = JsonSerializer.Serialize(request.Media!.Select(m => new AppMedia(m!.Url.Trim(), m.Kind)), JsonSerializerOptions.Web);
        entry.UpdatedAt = time.GetUtcNow();
    }

    private static AppDetails ToDetails(AppEntry entry) =>
        new(entry.Id, entry.Title, entry.Description, JsonSerializer.Deserialize<AppMedia[]>(entry.Media, JsonSerializerOptions.Web) ?? [], entry.CreatedAt);
}
