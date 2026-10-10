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

/// <summary>A kind of app, e.g. "Mobile app", shown as a label on the tile and in the popup.</summary>
public record AppCategoryDto(int Id, string Name);

/// <summary>Where to get the app, shown as "Check it on {Label}".</summary>
/// <param name="Label">E.g. "App Store", "Google Play", "Steam".</param>
/// <param name="Url">An http(s) link.</param>
public record AppLink(string Label, string Url);

/// <summary>An app as shown on the Apps page.</summary>
/// <param name="Description">May contain [text](https://…) links.</param>
/// <param name="Categories">In the order the admin set for categories.</param>
/// <param name="Platforms">What it runs on, e.g. "iOS"; shown in the popup only.</param>
/// <param name="Media">In the order the admin chose. The tile shows the first image.</param>
public record AppDetails(
    int Id,
    string Title,
    string Description,
    IReadOnlyList<AppCategoryDto> Categories,
    IReadOnlyList<string> Platforms,
    IReadOnlyList<AppLink> Links,
    IReadOnlyList<AppMedia> Media,
    DateTimeOffset CreatedAt);

/// <summary>
/// What the admin sends to add or change an app. Nullable so missing fields become validation
/// errors; the lists added later (categories, platforms, links) may be left out, meaning none.
/// </summary>
public record AppRequest(
    string? Title,
    string? Description,
    IReadOnlyList<AppMedia?>? Media,
    IReadOnlyList<int>? CategoryIds = null,
    IReadOnlyList<string?>? Platforms = null,
    IReadOnlyList<AppLink?>? Links = null);

/// <summary>One category in the admin's list. No id: a new one.</summary>
public record AppCategoryRequest(int? Id, string? Name);
