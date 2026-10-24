namespace Portfolio.Api.Features.YouTube;

/// <summary>A public video from the channel.</summary>
/// <param name="ThumbnailUrl">The largest thumbnail YouTube has for it.</param>
public record YouTubeVideo(string Id, string Title, string Description, string ThumbnailUrl, DateTimeOffset PublishedAt)
{
    public string Url => $"https://www.youtube.com/watch?v={Id}";
}

/// <summary>The "YouTube" configuration section. Videos aren't shown until both are set.</summary>
public class YouTubeOptions
{
    public const string Section = "YouTube";

    /// <summary>The channel: its handle ("@name") or its id ("UC…").</summary>
    public string Channel { get; set; } = "";

    /// <summary>A YouTube Data API v3 key (a secret).</summary>
    public string ApiKey { get; set; } = "";

    public bool IsConfigured => Channel.Trim().Length > 0 && ApiKey.Trim().Length > 0;

    /// <summary>
    /// The channel's page on YouTube (no API key needed), or null when no channel is set, or it's neither a handle nor
    /// a channel id (e.g. a pasted web address: a link built from it would go nowhere).
    /// </summary>
    public string? ChannelUrl => Channel.Trim() switch
    {
        ['@', _, ..] channel => $"https://www.youtube.com/@{Uri.EscapeDataString(channel[1..])}",
        ['U', 'C', _, ..] id when id.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_') => $"https://www.youtube.com/channel/{id}",
        _ => null,
    };
}

/// <param name="Url">The channel's page on youtube.com.</param>
public record YouTubeChannel(string Url);
