namespace Portfolio.Api.Features.Files;

public record StoredFileContent(string FileName, string ContentType, byte[] Content);

/// <summary>
/// Where uploaded files live. <see cref="DatabaseFileStorage"/> keeps them in PostgreSQL; an
/// object-storage version (Cloudflare R2, S3) would implement the same interface.
/// </summary>
public interface IFileStorage
{
    /// <summary>Stores the file and returns its id.</summary>
    Task<Guid> SaveAsync(string fileName, string contentType, byte[] content, CancellationToken cancellationToken);

    /// <summary>Null when there is no such file.</summary>
    Task<StoredFileContent?> GetAsync(Guid id, CancellationToken cancellationToken);

    /// <summary>
    /// Deletes the files that aren't in <paramref name="keep"/> and were uploaded before
    /// <paramref name="uploadedBefore"/>, e.g. a photo that was replaced, or uploaded and never saved.
    /// </summary>
    Task DeleteAllExceptAsync(IReadOnlyCollection<Guid> keep, DateTimeOffset uploadedBefore, CancellationToken cancellationToken);
}
