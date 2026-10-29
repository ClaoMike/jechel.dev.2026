using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Portfolio.Api.Features.Site;

/// <summary>
/// One row: what visitors can see (each page, and features that need setting up once live), and
/// whether the site is under maintenance. Edited in the Settings tab.
/// </summary>
public class SiteState
{
    public const int SingletonId = 1;

    public int Id { get; set; }

    /// <summary>JSON object: page id → shown to visitors. A page missing from it uses the default (Site:PagesVisibleByDefault).</summary>
    public string Pages { get; set; } = "{}";

    /// <summary>JSON object: feature id → offered to visitors; like <see cref="Pages"/>.</summary>
    public string Features { get; set; } = "{}";

    public bool MaintenanceEnabled { get; set; }

    /// <summary>Shown on the maintenance screen, e.g. "Back at 18:00". Optional.</summary>
    public string MaintenanceMessage { get; set; } = "";

    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>How <see cref="SiteState"/> is stored (its table and columns).</summary>
internal sealed class SiteStateConfiguration : IEntityTypeConfiguration<SiteState>
{
    public void Configure(EntityTypeBuilder<SiteState> entity)
    {
        entity.ToTable("site_state");
        entity.HasKey(s => s.Id);
        entity.Property(s => s.Id).HasColumnName("id").ValueGeneratedNever();
        entity.Property(s => s.Pages).HasColumnName("pages").HasColumnType("jsonb").IsRequired();
        entity.Property(s => s.Features).HasColumnName("features").HasColumnType("jsonb").IsRequired();
        entity.Property(s => s.MaintenanceEnabled).HasColumnName("maintenance_enabled");
        entity.Property(s => s.MaintenanceMessage).HasColumnName("maintenance_message").HasMaxLength(Features.Site.SiteShared.MessageMaxLength).IsRequired();
        entity.Property(s => s.UpdatedAt).HasColumnName("updated_at");
    }
}
