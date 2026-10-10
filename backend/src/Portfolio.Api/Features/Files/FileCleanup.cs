using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;
using Portfolio.Api.Features.About;
using Portfolio.Api.Features.Apps;

namespace Portfolio.Api.Features.Files;

/// <summary>Deletes uploads nothing uses any more: not the About Me page, and no app.</summary>
public static class FileCleanup
{
    /// <summary>Unused uploads are only deleted once they're this old: an editor may still be open with them.</summary>
    public static readonly TimeSpan GracePeriod = TimeSpan.FromDays(1);

    /// <summary>Call after saving anything that holds file URLs.</summary>
    public static async Task DeleteUnusedAsync(PortfolioDbContext db, IFileStorage files, TimeProvider time, CancellationToken cancellationToken)
    {
        var page = await AboutEndpoints.LoadAsync(db, cancellationToken);
        var appMedia = await db.Apps.AsNoTracking().Select(a => a.Media).ToListAsync(cancellationToken);

        IEnumerable<string> urls = [page.PhotoUrl, page.Links.ResumeUrl, .. page.Papers.Select(p => p.FileUrl)];
        urls = urls.Concat(appMedia.SelectMany(json => JsonSerializer.Deserialize<AppMedia[]>(json, JsonSerializerOptions.Web) ?? []).Select(m => m.Url));

        Guid[] used = [.. urls.Select(FileRules.FileIdIn).OfType<Guid>()];
        await files.DeleteAllExceptAsync(used, time.GetUtcNow() - GracePeriod, cancellationToken);
    }
}
