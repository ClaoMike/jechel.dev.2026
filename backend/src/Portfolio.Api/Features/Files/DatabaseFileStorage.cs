using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Files;

/// <summary>Files as rows of the stored_files table. Fine for a photo and a PDF; not for large media.</summary>
public class DatabaseFileStorage(PortfolioDbContext db, TimeProvider time) : IFileStorage
{
    public async Task<Guid> SaveAsync(string fileName, string contentType, byte[] content, CancellationToken cancellationToken)
    {
        var file = new StoredFile
        {
            Id = Guid.CreateVersion7(),
            FileName = fileName,
            ContentType = contentType,
            Content = content,
            CreatedAt = time.GetUtcNow(),
        };
        db.StoredFiles.Add(file);
        await db.SaveChangesAsync(cancellationToken);
        return file.Id;
    }

    public Task<StoredFileContent?> GetAsync(Guid id, CancellationToken cancellationToken) =>
        db.StoredFiles
            .AsNoTracking()
            .Where(f => f.Id == id)
            .Select(f => new StoredFileContent(f.FileName, f.ContentType, f.Content))
            .FirstOrDefaultAsync(cancellationToken);

    public async Task DeleteAllExceptAsync(IReadOnlyCollection<Guid> keep, DateTimeOffset uploadedBefore, CancellationToken cancellationToken)
    {
        // Loads ids only, then deletes through the change tracker, so it also works on the
        // in-memory provider the unit tests use (it has no ExecuteDelete).
        var ids = await db.StoredFiles
            .Where(f => f.CreatedAt < uploadedBefore && !keep.Contains(f.Id))
            .Select(f => f.Id)
            .ToListAsync(cancellationToken);
        if (ids.Count == 0) return;

        foreach (var id in ids)
        {
            // A stub is enough to delete by key, without loading the file's bytes.
            var file = db.StoredFiles.Local.FirstOrDefault(f => f.Id == id)
                ?? db.StoredFiles.Attach(new StoredFile { Id = id, FileName = "", ContentType = "", Content = [] }).Entity;
            db.StoredFiles.Remove(file);
        }
        await db.SaveChangesAsync(cancellationToken);
    }
}
