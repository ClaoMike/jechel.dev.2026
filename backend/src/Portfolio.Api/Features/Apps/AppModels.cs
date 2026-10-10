namespace Portfolio.Api.Features.Apps;

public static class AppMediaKinds
{
    public const string Image = "image";
    public const string Video = "video";
    public static readonly IReadOnlyList<string> All = [Image, Video];
}

/// <summary>An image or video of an app.</summary>
/// <param name="Url">An upload (a /api/files/… path).</param>
/// <param name="Kind">One of <see cref="AppMediaKinds"/>.</param>
public record AppMedia(string Url, string Kind);

/// <summary>An app as shown on the Apps page.</summary>
/// <param name="Description">May contain [text](https://…) links.</param>
/// <param name="Media">In the order the admin chose. The tile shows the first image.</param>
public record AppDetails(int Id, string Title, string Description, IReadOnlyList<AppMedia> Media, DateTimeOffset CreatedAt);

/// <summary>What the admin sends to add or change an app. Nullable so missing fields become validation errors.</summary>
public record AppRequest(string? Title, string? Description, IReadOnlyList<AppMedia?>? Media);
