using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Portfolio.Api.Features.Apps;

/// <summary>An app on the Apps page (Features/Apps).</summary>
public class AppEntry
{
    public int Id { get; set; }
    public required string Title { get; set; }
    public required string Description { get; set; }

    /// <summary>The images and videos, in the order shown, as a JSON list of AppMedia.</summary>
    public required string Media { get; set; }

    /// <summary>Ids of its <see cref="AppCategory"/>s, as a JSON list.</summary>
    public string CategoryIds { get; set; } = "[]";

    /// <summary>What it runs on ("iOS", "Android"), as a JSON list of strings.</summary>
    public string Platforms { get; set; } = "[]";

    /// <summary>Where to get it, as a JSON list of AppLink.</summary>
    public string Links { get; set; } = "[]";

    /// <summary>Where it stands in the admin's order (Organise): the Apps page lists them by it, lowest first.</summary>
    public int Position { get; set; }

    /// <summary>Whether What's new? may show it. When the first app in the order may not, the next one that may is shown.</summary>
    public bool ShowInWhatsNew { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>How <see cref="AppEntry"/> is stored (its table and columns).</summary>
internal sealed class AppEntryConfiguration : IEntityTypeConfiguration<AppEntry>
{
    public void Configure(EntityTypeBuilder<AppEntry> entity)
    {
        entity.ToTable("apps");
        entity.HasKey(a => a.Id);
        entity.Property(a => a.Id).HasColumnName("id");
        entity.Property(a => a.Title).HasColumnName("title").HasMaxLength(Features.Apps.AppRules.TitleMaxLength).IsRequired();
        entity.Property(a => a.Description).HasColumnName("description").HasMaxLength(Features.Apps.AppRules.DescriptionMaxLength).IsRequired();
        entity.Property(a => a.Media).HasColumnName("media").HasColumnType("jsonb").IsRequired();
        entity.Property(a => a.CategoryIds).HasColumnName("category_ids").HasColumnType("jsonb").IsRequired().HasDefaultValueSql("'[]'::jsonb");
        entity.Property(a => a.Platforms).HasColumnName("platforms").HasColumnType("jsonb").IsRequired().HasDefaultValueSql("'[]'::jsonb");
        entity.Property(a => a.Links).HasColumnName("links").HasColumnType("jsonb").IsRequired().HasDefaultValueSql("'[]'::jsonb");
        entity.Property(a => a.Position).HasColumnName("position");
        // No database default: with one, EF Core would leave out a false (the CLR default) and the database's true would win.
        entity.Property(a => a.ShowInWhatsNew).HasColumnName("show_in_whats_new");
        entity.Property(a => a.CreatedAt).HasColumnName("created_at");
        entity.Property(a => a.UpdatedAt).HasColumnName("updated_at");

        // The grid lists them in the admin's order.
        entity.HasIndex(a => a.Position);
    }
}
