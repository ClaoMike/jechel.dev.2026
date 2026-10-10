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
}
