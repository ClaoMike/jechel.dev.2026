namespace Portfolio.Api.Data;

/// <summary>
/// The last list of videos fetched for a channel (Features/YouTube), kept so it survives restarts
/// and can be shown while YouTube is unreachable.
/// </summary>
public class YouTubeSnapshot
{
    /// <summary>The configured channel (handle or id), lower-cased.</summary>
    public required string Channel { get; set; }

    /// <summary>The YouTubeVideo list, newest first, as JSON.</summary>
    public required string Videos { get; set; }

    public DateTimeOffset FetchedAt { get; set; }
}
