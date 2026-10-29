using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Files;
using static Portfolio.Api.Features.Apps.AppShared;

namespace Portfolio.Api.Features.Apps;

/// <summary>Admin only. Replaces everything about the app but when it was added and its place in the order.</summary>
public sealed class UpdateApp : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/apps").MapPut("/{id:int}", Handle).WithName("UpdateApp").RequireAuthorization();

    public static async Task<Results<Ok<AppDetails>, NotFound, ValidationProblem>> Handle(
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
}
