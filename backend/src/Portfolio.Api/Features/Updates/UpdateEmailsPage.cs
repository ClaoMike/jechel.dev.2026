using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Portfolio.Api.Features.Updates;

/// <summary>
/// The wording of the emails subscribers get, as one JSON document (see Features/Updates/UpdateEmailWording.cs),
/// read and saved as a whole. There is only ever one row; until the admin saves it, the defaults apply.
/// </summary>
public class UpdateEmailsPage
{
    public const int SingletonId = 1;

    public int Id { get; set; }
    public required string Content { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>How <see cref="UpdateEmailsPage"/> is stored (its table and columns).</summary>
internal sealed class UpdateEmailsPageConfiguration : IEntityTypeConfiguration<UpdateEmailsPage>
{
    public void Configure(EntityTypeBuilder<UpdateEmailsPage> entity)
    {
        entity.ToTable("update_emails");
        entity.HasKey(p => p.Id);
        entity.Property(p => p.Id).HasColumnName("id").ValueGeneratedNever();
        entity.Property(p => p.Content).HasColumnName("content").HasColumnType("jsonb").IsRequired();
        entity.Property(p => p.UpdatedAt).HasColumnName("updated_at");
    }
}
