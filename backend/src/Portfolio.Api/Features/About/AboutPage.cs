using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Portfolio.Api.Features.About;

/// <summary>
/// The About Me page, as one JSON document (see Features/About/AboutContent.cs): it's read and
/// saved as a whole, and its shape is expected to keep changing. There is only ever one row.
/// </summary>
public class AboutPage
{
    public const int SingletonId = 1;

    public int Id { get; set; }
    public required string Content { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>How <see cref="AboutPage"/> is stored (its table and columns).</summary>
internal sealed class AboutPageConfiguration : IEntityTypeConfiguration<AboutPage>
{
    public void Configure(EntityTypeBuilder<AboutPage> entity)
    {
        entity.ToTable("about_page");
        entity.HasKey(p => p.Id);
        entity.Property(p => p.Id).HasColumnName("id").ValueGeneratedNever();
        entity.Property(p => p.Content).HasColumnName("content").HasColumnType("jsonb").IsRequired();
        entity.Property(p => p.UpdatedAt).HasColumnName("updated_at");
    }
}
