namespace Portfolio.Api.Features.YouTube;

public static class YouTubeShared
{
    public const int DefaultPageSize = 9;
    public const int MaxPageSize = 50;

    /// <summary>How long browsers may reuse a page of videos before asking again (Cache-Control).</summary>
    public static readonly TimeSpan BrowserCacheFor = TimeSpan.FromMinutes(5);

}

/// <param name="Count">How many public videos the channel has now.</param>
public record RefreshResult(int Count);
