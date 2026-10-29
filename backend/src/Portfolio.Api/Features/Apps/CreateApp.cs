using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Files;
using Portfolio.Api.Features.Updates;
using static Portfolio.Api.Features.Apps.AppShared;

namespace Portfolio.Api.Features.Apps;

/// <summary>Admin only. It goes first in the order. Then asks the admin's phone whether to email the subscribers about it.</summary>
public sealed class CreateApp : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/apps").MapPost("/", Handle).WithName("CreateApp").RequireAuthorization();

    public static async Task<Results<Created<AppDetails>, ValidationProblem>> Handle(
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
}
