using System.Text.RegularExpressions;

namespace Portfolio.Api.Features.Apps;

/// <summary>Recognises YouTube video links. Same rules as the frontend's features/apps/media.ts.</summary>
public static partial class YouTubeLinks
{
    /// <summary>
    /// The 11-character video id in youtube.com/watch?v=…, youtu.be/…, youtube.com/shorts/…,
    /// youtube.com/embed/… or youtube-nocookie.com/embed/…; null for anything else.
    /// </summary>
    public static string? VideoIdIn(string? url)
    {
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri)) return null;
        if (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp) return null;

        var host = uri.Host.ToLowerInvariant();
        string? id = null;
        if (host == "youtu.be")
        {
            id = uri.AbsolutePath.Trim('/');
        }
        else if (host is "youtube.com" or "www.youtube.com" or "m.youtube.com" or "music.youtube.com" or "www.youtube-nocookie.com" or "youtube-nocookie.com")
        {
            var path = uri.AbsolutePath;
            if (path == "/watch") id = System.Web.HttpUtility.ParseQueryString(uri.Query)["v"];
            else if (PathId().Match(path) is { Success: true } match) id = match.Groups[1].Value;
        }
        return id is not null && VideoId().IsMatch(id) ? id : null;
    }

    public static string WatchUrl(string videoId) => $"https://www.youtube.com/watch?v={videoId}";

    [GeneratedRegex("^/(?:shorts|embed|live)/([^/]+)/?$")]
    private static partial Regex PathId();

    [GeneratedRegex("^[A-Za-z0-9_-]{11}$")]
    private static partial Regex VideoId();
}
