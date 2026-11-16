using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Portfolio.Api.Features.Terms;

/// <summary>
/// The terms and conditions, as one JSON document (see Features/Terms/TermsContent.cs), read and
/// saved as a whole. There is only ever one row.
/// </summary>
public class TermsPage
{
    public const int SingletonId = 1;

    public int Id { get; set; }
    public required string Content { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>How <see cref="TermsPage"/> is stored (its table and columns).</summary>
internal sealed class TermsPageConfiguration : IEntityTypeConfiguration<TermsPage>
{
    public void Configure(EntityTypeBuilder<TermsPage> entity)
    {
        entity.ToTable("terms_page");
        entity.HasKey(p => p.Id);
        entity.Property(p => p.Id).HasColumnName("id").ValueGeneratedNever();
        entity.Property(p => p.Content).HasColumnName("content").HasColumnType("jsonb").IsRequired();
        entity.Property(p => p.UpdatedAt).HasColumnName("updated_at");
    }
}
