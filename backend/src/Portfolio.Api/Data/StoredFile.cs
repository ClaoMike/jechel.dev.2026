namespace Portfolio.Api.Data;

/// <summary>
/// A file the admin uploaded (the About Me photo or résumé), stored in the database. Reached
/// through <see cref="Features.Files.IFileStorage"/>, so it can move to object storage later.
/// </summary>
public class StoredFile
{
    public Guid Id { get; set; }

    /// <summary>The name it's downloaded as, e.g. "Claudiu Jechel CV.pdf".</summary>
    public required string FileName { get; set; }

    public required string ContentType { get; set; }
    public required byte[] Content { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
