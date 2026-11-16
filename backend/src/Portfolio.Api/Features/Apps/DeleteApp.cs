using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Files;
using Portfolio.Api.Features.Updates;

namespace Portfolio.Api.Features.Apps;

/// <summary>
/// Admin only. Its images and videos are deleted with the next cleanup, a day later. An email about it that hasn't
/// gone out (waiting for the admin, or about to be sent) won't: it's marked not sent.
/// </summary>
public sealed class DeleteApp : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/apps").MapDelete("/{id:int}", Handle).WithName("DeleteApp").RequireAuthorization();

    public static async Task<Results<NoContent, NotFound>> Handle(
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
}
