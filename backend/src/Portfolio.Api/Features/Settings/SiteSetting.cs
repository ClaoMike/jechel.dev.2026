using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Portfolio.Api.Features.Settings;

/// <summary>
/// A connection setting the admin saved in the Settings tab, e.g. the Resend API key. It overrides
/// the same key in the configuration (appsettings, user secrets, environment). Secrets are stored
/// encrypted with ASP.NET Core Data Protection and never sent back to the browser.
/// </summary>
public class SiteSetting
{
    /// <summary>The configuration key it overrides, e.g. "Email:ResendApiKey".</summary>
    public required string Key { get; set; }

    /// <summary>Encrypted when <see cref="IsEncrypted"/>.</summary>
    public required string Value { get; set; }

    public bool IsEncrypted { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>How <see cref="SiteSetting"/> is stored (its table and columns).</summary>
internal sealed class SiteSettingConfiguration : IEntityTypeConfiguration<SiteSetting>
{
    public void Configure(EntityTypeBuilder<SiteSetting> entity)
    {
        entity.ToTable("site_settings");
        entity.HasKey(s => s.Key);
        entity.Property(s => s.Key).HasColumnName("key").HasMaxLength(100);
        entity.Property(s => s.Value).HasColumnName("value").IsRequired();
        entity.Property(s => s.IsEncrypted).HasColumnName("is_encrypted");
        entity.Property(s => s.UpdatedAt).HasColumnName("updated_at");
    }
}
