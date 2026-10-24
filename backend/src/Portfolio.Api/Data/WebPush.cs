namespace Portfolio.Api.Data;

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

/// <summary>A way alerts go (ntfy, the site's own notifications) switched on or off in the Notifications tab. One without a row is on.</summary>
public class AlertChannelSetting
{
    /// <summary>One of Features.Alerts.AlertChannels.</summary>
    public required string Channel { get; set; }

    public bool Enabled { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
