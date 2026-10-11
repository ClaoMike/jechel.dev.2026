using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;

namespace Portfolio.Api.Features.YouTube;

public interface IYouTubeClient
{
    /// <summary>Every public video of the configured channel, newest first. Throws when YouTube can't be reached.</summary>
    Task<IReadOnlyList<YouTubeVideo>> FetchVideosAsync(CancellationToken cancellationToken);
}

/// <summary>
/// Reads the channel's uploads with the YouTube Data API v3: one call to find the channel's
/// "uploads" playlist, then one per 50 videos. Each costs 1 unit of the free 10,000 a day.
/// </summary>
public class YouTubeClient(HttpClient http, IOptions<YouTubeOptions> options) : IYouTubeClient
{
    public static readonly Uri BaseAddress = new("https://www.googleapis.com/youtube/v3/");

    /// <summary>Stops paging after this many, in case of a huge channel.</summary>
    public const int MaxVideos = 1000;

    public async Task<IReadOnlyList<YouTubeVideo>> FetchVideosAsync(CancellationToken cancellationToken)
    {
        var key = Uri.EscapeDataString(options.Value.ApiKey.Trim());
        var channel = options.Value.Channel.Trim();
        var channelQuery = channel.StartsWith('@') ? $"forHandle={Uri.EscapeDataString(channel)}" : $"id={Uri.EscapeDataString(channel)}";

        var channels = await GetAsync($"channels?part=contentDetails&{channelQuery}&key={key}", cancellationToken);
        var uploads = UploadsPlaylistId(channels);

        var videos = new List<YouTubeVideo>();
        string? pageToken = null;
        do
        {
            var tokenQuery = pageToken is null ? "" : $"&pageToken={Uri.EscapeDataString(pageToken)}";
            var page = await GetAsync($"playlistItems?part=snippet,contentDetails,status&maxResults=50&playlistId={Uri.EscapeDataString(uploads)}{tokenQuery}&key={key}", cancellationToken);
            videos.AddRange(ReadVideos(page));
            pageToken = page["nextPageToken"]?.GetValue<string>();
        }
        while (pageToken is not null && videos.Count < MaxVideos);

        return [.. videos.OrderByDescending(v => v.PublishedAt)];
    }

    private async Task<JsonNode> GetAsync(string path, CancellationToken cancellationToken)
    {
        using var response = await http.GetAsync(path, cancellationToken);
        response.EnsureSuccessStatusCode();
        return JsonNode.Parse(await response.Content.ReadAsStringAsync(cancellationToken)) ?? throw new InvalidDataException("YouTube answered with nothing.");
    }

    /// <summary>From a channels.list answer.</summary>
    public static string UploadsPlaylistId(JsonNode channels) =>
        (channels["items"] as JsonArray)?.FirstOrDefault()?["contentDetails"]?["relatedPlaylists"]?["uploads"]?.GetValue<string>()
        ?? throw new InvalidDataException("YouTube has no such channel.");

    /// <summary>The public videos in a playlistItems.list answer. Private and deleted ones are left out.</summary>
    public static IEnumerable<YouTubeVideo> ReadVideos(JsonNode page)
    {
        foreach (var item in page["items"]?.AsArray() ?? [])
        {
            if (item?["status"]?["privacyStatus"]?.GetValue<string>() != "public") continue;
            var snippet = item["snippet"];
            var id = snippet?["resourceId"]?["videoId"]?.GetValue<string>();
            if (snippet is null || id is null) continue;

            var published = item["contentDetails"]?["videoPublishedAt"]?.GetValue<string>() ?? snippet["publishedAt"]?.GetValue<string>();
            yield return new YouTubeVideo(
                id,
                snippet["title"]?.GetValue<string>() ?? "",
                snippet["description"]?.GetValue<string>() ?? "",
                LargestThumbnail(snippet["thumbnails"]) ?? $"https://i.ytimg.com/vi/{id}/hqdefault.jpg",
                published is null ? default : DateTimeOffset.Parse(published, System.Globalization.CultureInfo.InvariantCulture));
        }
    }

    private static string? LargestThumbnail(JsonNode? thumbnails) =>
        new[] { "maxres", "standard", "high", "medium", "default" }
            .Select(size => thumbnails?[size]?["url"]?.GetValue<string>())
            .FirstOrDefault(url => url is not null);
}
