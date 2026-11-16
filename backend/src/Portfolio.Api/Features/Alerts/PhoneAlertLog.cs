using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Portfolio.Api.Features.Alerts;

/// <summary>A phone alert the site raised, sent or not (its kind switched off, nowhere set up to send it, or it failed): the Notifications tab's history.</summary>
public class PhoneAlertLog
{
    public long Id { get; set; }

    /// <summary>One of Features.Alerts.AlertKinds.</summary>
    public required string Kind { get; set; }

    public required string Title { get; set; }
    public required string Message { get; set; }

    /// <summary>Where tapping it went on the site, e.g. "/contact".</summary>
    public string? Path { get; set; }

    /// <summary>One of <see cref="Features.Alerts.AlertStatus"/>.</summary>
    public required string Status { get; set; }

    /// <summary>Where it went, once sent: Features.Alerts.AlertChannels, comma-separated (e.g. "ntfy,push"); null when it wasn't.</summary>
    public string? SentTo { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>How <see cref="PhoneAlertLog"/> is stored (its table and columns).</summary>
internal sealed class PhoneAlertLogConfiguration : IEntityTypeConfiguration<PhoneAlertLog>
{
    public void Configure(EntityTypeBuilder<PhoneAlertLog> entity)
    {
        entity.ToTable("phone_alerts");
        entity.HasKey(a => a.Id);
        entity.Property(a => a.Id).HasColumnName("id");
        entity.Property(a => a.Kind).HasColumnName("kind").HasMaxLength(40).IsRequired();
        entity.Property(a => a.Title).HasColumnName("title").HasMaxLength(200).IsRequired();
        entity.Property(a => a.Message).HasColumnName("message").HasMaxLength(1000).IsRequired();
        entity.Property(a => a.Path).HasColumnName("path").HasMaxLength(200);
        entity.Property(a => a.Status).HasColumnName("status").HasMaxLength(20).IsRequired();
        entity.Property(a => a.SentTo).HasColumnName("sent_to").HasMaxLength(40);
        entity.Property(a => a.CreatedAt).HasColumnName("created_at");
        // Newest first, all or of one kind.
        entity.HasIndex(a => a.CreatedAt);
        entity.HasIndex(a => new { a.Kind, a.CreatedAt });
    }
}

/// <summary>A kind of phone alert switched on or off in the Notifications tab. A kind without a row is on.</summary>
public class AlertPreference
{
    /// <summary>One of Features.Alerts.AlertKinds.</summary>
    public required string Kind { get; set; }

    public bool Enabled { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>How <see cref="AlertPreference"/> is stored (its table and columns).</summary>
internal sealed class AlertPreferenceConfiguration : IEntityTypeConfiguration<AlertPreference>
{
    public void Configure(EntityTypeBuilder<AlertPreference> entity)
    {
        entity.ToTable("alert_preferences");
        entity.HasKey(p => p.Kind);
        entity.Property(p => p.Kind).HasColumnName("kind").HasMaxLength(40);
        entity.Property(p => p.Enabled).HasColumnName("enabled");
        entity.Property(p => p.UpdatedAt).HasColumnName("updated_at");
    }
}
