using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Portfolio.Api.Features.Apps;

/// <summary>A kind of app the admin defined, e.g. "Video game" (Features/Apps).</summary>
public class AppCategory
{
    public int Id { get; set; }
    public required string Name { get; set; }

    /// <summary>Categories are listed by this, then shown on apps in the same order.</summary>
    public int Position { get; set; }
}

/// <summary>How <see cref="AppCategory"/> is stored (its table and columns).</summary>
internal sealed class AppCategoryConfiguration : IEntityTypeConfiguration<AppCategory>
{
    public void Configure(EntityTypeBuilder<AppCategory> entity)
    {
        entity.ToTable("app_categories");
        entity.HasKey(c => c.Id);
        entity.Property(c => c.Id).HasColumnName("id");
        entity.Property(c => c.Name).HasColumnName("name").HasMaxLength(Features.Apps.AppRules.CategoryNameMaxLength).IsRequired();
        entity.Property(c => c.Position).HasColumnName("position");
    }
}
