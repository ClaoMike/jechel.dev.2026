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

    /// <summary>The channel's page on YouTube (no API key needed), or null when no channel is set.</summary>
    public string? ChannelUrl => Channel.Trim() switch
    {
        "" => null,
        ['@', .. var handle] => $"https://www.youtube.com/@{Uri.EscapeDataString(handle)}",
        var id => $"https://www.youtube.com/channel/{Uri.EscapeDataString(id)}",
    };
}

/// <param name="Url">The channel's page on youtube.com.</param>
public record YouTubeChannel(string Url);
