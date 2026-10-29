using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Portfolio.Api.Features.Alerts;

/// <summary>
/// A browser that gets the site's own notifications (Web Push): the admin's iPhone with the site on its Home Screen, or
/// a computer's browser. Its address at its push service (Apple's, Google's, Mozilla's) and the keys to encrypt for it.
/// </summary>
public class PushDevice
{
    public int Id { get; set; }

    /// <summary>Where notifications for it are posted (its push service hands them on). Unique.</summary>
    public required string Endpoint { get; set; }

    /// <summary>Its public key (P-256, base64url): notifications are encrypted for it.</summary>
    public required string P256dh { get; set; }

    /// <summary>Its authentication secret (base64url), part of the encryption.</summary>
    public required string Auth { get; set; }

    /// <summary>What it is, for the admin's list, e.g. "iPhone · Safari".</summary>
    public required string Label { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>When a notification last reached its push service.</summary>
    public DateTimeOffset? LastSentAt { get; set; }
}

/// <summary>How <see cref="PushDevice"/> is stored (its table and columns).</summary>
internal sealed class PushDeviceConfiguration : IEntityTypeConfiguration<PushDevice>
{
    public void Configure(EntityTypeBuilder<PushDevice> entity)
    {
        entity.ToTable("push_devices");
        entity.HasKey(d => d.Id);
        entity.Property(d => d.Id).HasColumnName("id");
        entity.Property(d => d.Endpoint).HasColumnName("endpoint").HasMaxLength(1000).IsRequired();
        entity.Property(d => d.P256dh).HasColumnName("p256dh").HasMaxLength(200).IsRequired();
        entity.Property(d => d.Auth).HasColumnName("auth").HasMaxLength(100).IsRequired();
        entity.Property(d => d.Label).HasColumnName("label").HasMaxLength(100).IsRequired();
        entity.Property(d => d.CreatedAt).HasColumnName("created_at");
        entity.Property(d => d.LastSentAt).HasColumnName("last_sent_at");
        entity.HasIndex(d => d.Endpoint).IsUnique();
    }
}

/// <summary>
/// The site's own key pair for Web Push (VAPID, P-256, base64url): push services take notifications signed with it. Made
/// once, the first time it's needed, and kept: a new pair would cut off every device that allowed notifications.
/// </summary>
public class WebPushKeys
{
    public const int SingletonId = 1;

    public int Id { get; set; }
    public required string PublicKey { get; set; }
    public required string PrivateKey { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>How <see cref="WebPushKeys"/> is stored (its table and columns).</summary>
internal sealed class WebPushKeysConfiguration : IEntityTypeConfiguration<WebPushKeys>
{
    public void Configure(EntityTypeBuilder<WebPushKeys> entity)
    {
        entity.ToTable("web_push_keys");
        entity.HasKey(k => k.Id);
        entity.Property(k => k.Id).HasColumnName("id").ValueGeneratedNever();
        entity.Property(k => k.PublicKey).HasColumnName("public_key").HasMaxLength(200).IsRequired();
        entity.Property(k => k.PrivateKey).HasColumnName("private_key").HasMaxLength(200).IsRequired();
        entity.Property(k => k.CreatedAt).HasColumnName("created_at");
    }
}

/// <summary>A way alerts go (ntfy, the site's own notifications) switched on or off in the Notifications tab. One without a row is on.</summary>
public class AlertChannelSetting
{
    /// <summary>One of Features.Alerts.AlertChannels.</summary>
    public required string Channel { get; set; }

    public bool Enabled { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>How <see cref="AlertChannelSetting"/> is stored (its table and columns).</summary>
internal sealed class AlertChannelSettingConfiguration : IEntityTypeConfiguration<AlertChannelSetting>
{
    public void Configure(EntityTypeBuilder<AlertChannelSetting> entity)
    {
        entity.ToTable("alert_channels");
        entity.HasKey(c => c.Channel);
        entity.Property(c => c.Channel).HasColumnName("channel").HasMaxLength(20);
        entity.Property(c => c.Enabled).HasColumnName("enabled");
        entity.Property(c => c.UpdatedAt).HasColumnName("updated_at");
    }
}
