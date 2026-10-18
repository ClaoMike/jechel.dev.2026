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

/// <summary>Something new that was emailed to the subscribers. Unique on kind + key, so nothing is announced twice.</summary>
public class Announcement
{
    public int Id { get; set; }

    /// <summary>"app" or "video".</summary>
    public required string Kind { get; set; }

    /// <summary>The app's id or the video's id.</summary>
    public required string ItemKey { get; set; }

    public required string Title { get; set; }
    public DateTimeOffset SentAt { get; set; }

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
