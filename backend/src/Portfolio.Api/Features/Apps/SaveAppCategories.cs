using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Apps.AppShared;

namespace Portfolio.Api.Features.Apps;

/// <summary>
/// Admin only. Replaces the list: categories with an id are renamed and reordered, those
/// without are added, and those left out are deleted (and taken off every app).
/// </summary>
public sealed class SaveAppCategories : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/apps").MapPut("/categories", Handle).WithName("SaveAppCategories").RequireAuthorization();

    public static async Task<Results<Ok<IReadOnlyList<AppCategoryDto>>, ValidationProblem>> Handle(
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
}
