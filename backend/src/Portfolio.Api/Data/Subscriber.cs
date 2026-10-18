namespace Portfolio.Api.Data;

/// <summary>
/// Someone who asked for an email when something new is posted. They get updates only once
/// they've confirmed (double opt-in), and unsubscribing deletes them.
/// </summary>
public class Subscriber
{
    public int Id { get; set; }

    /// <summary>Lower case, unique.</summary>
    public required string Email { get; set; }

    /// <summary>Random and unique: in the confirm and unsubscribe links, so only the mailbox's owner can use them.</summary>
    public required string Token { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>When the confirmation email last went out; it isn't sent again sooner than a cooldown.</summary>
    public DateTimeOffset ConfirmationSentAt { get; set; }

    /// <summary>Null until they click the link in the confirmation email.</summary>
    public DateTimeOffset? ConfirmedAt { get; set; }
}

/// <summary>
/// Something new to email the subscribers about. A new app waits for the admin (an alert asks: send
/// or ignore); a new video is approved at once. Unique on kind + key, so nothing is announced twice.
/// </summary>
public class Announcement
{
    public int Id { get; set; }

    /// <summary>"app" or "video".</summary>
    public required string Kind { get; set; }

    /// <summary>The app's id or the video's id.</summary>
    public required string ItemKey { get; set; }

    public required string Title { get; set; }

    /// <summary>One of <see cref="Features.Updates.AnnouncementStatus"/>.</summary>
    public required string Status { get; set; }

    /// <summary>SHA-256 (hex) of the token in the alert's Send / Ignore buttons; null once decided.</summary>
    public string? DecisionTokenHash { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>When the emails went out; null until then.</summary>
    public DateTimeOffset? SentAt { get; set; }

    /// <summary>How many emails went out.</summary>
    public int RecipientCount { get; set; }
}

/// <summary>
/// One row: when announcing started. Only apps and videos posted after it are announced, so the
/// first subscribers aren't sent everything posted before the feature existed.
/// </summary>
public class UpdatesState
{
    public const int SingletonId = 1;

    public int Id { get; set; }
    public DateTimeOffset AnnounceAfter { get; set; }
}
