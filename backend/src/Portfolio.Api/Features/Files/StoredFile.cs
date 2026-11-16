using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Portfolio.Api.Features.Files;

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

/// <summary>How <see cref="StoredFile"/> is stored (its table and columns).</summary>
internal sealed class StoredFileConfiguration : IEntityTypeConfiguration<StoredFile>
{
    public void Configure(EntityTypeBuilder<StoredFile> entity)
    {
        entity.ToTable("stored_files");
        entity.HasKey(f => f.Id);
        entity.Property(f => f.Id).HasColumnName("id").ValueGeneratedNever();
        entity.Property(f => f.FileName).HasColumnName("file_name").HasMaxLength(FileRules.FileNameMaxLength).IsRequired();
        entity.Property(f => f.ContentType).HasColumnName("content_type").HasMaxLength(100).IsRequired();
        entity.Property(f => f.Content).HasColumnName("content").IsRequired();
        entity.Property(f => f.CreatedAt).HasColumnName("created_at");
    }
}
