using Portfolio.Api.Features.About;
using Portfolio.Api.Features.Files;

namespace Portfolio.Api.Features.Apps;

/// <summary>Validation of an app. Error keys are JSON paths, e.g. "media[2].url".</summary>
public static class AppRules
{
    public const int TitleMaxLength = 120;
    public const int DescriptionMaxLength = 5000;
    public const int MaxMedia = 30;
    public const int CategoryNameMaxLength = 40;
    public const int MaxCategories = 30;
    public const int PlatformMaxLength = 40;
    public const int MaxPlatforms = 20;
    public const int LinkLabelMaxLength = 40;
    public const int MaxLinks = 10;

    /// <summary>Why an order can't be saved when apps were added or deleted since it was loaded.</summary>
    public const string OrderOutOfDate = "Apps were added or deleted meanwhile. Load the list again, then arrange it.";

    /// <param name="categoryIds">The ids of the categories that exist; null skips that check.</param>
    public static Dictionary<string, string[]> Validate(AppRequest? request, IReadOnlyCollection<int>? categoryIds = null)
    {
        var errors = new Dictionary<string, string[]>();
        void Add(string key, string message) => errors[key] = [message];

        if (request is null)
        {
            Add("", "The app is required.");
            return errors;
        }

        var title = request.Title?.Trim() ?? "";
        if (title.Length == 0) Add("title", "Required.");
        else if (title.Length > TitleMaxLength) Add("title", $"Must be at most {TitleMaxLength} characters.");

        var description = request.Description?.Trim() ?? "";
        if (description.Length > DescriptionMaxLength) Add("description", $"Must be at most {DescriptionMaxLength} characters.");
        else if (AboutRules.LinksIn(description).Any(url => !AboutRules.IsSafeUrl(url))) Add("description", "Links must be http(s) links, or paths on this site starting with /.");

        if (request.Media is null) Add("media", "Required (can be empty).");
        else if (request.Media.Count > MaxMedia) Add("media", $"At most {MaxMedia} images and videos.");
        else
        {
            for (var i = 0; i < request.Media.Count; i++)
            {
                var media = request.Media[i];
                if (media is null) { Add($"media[{i}].url", "Required."); continue; }
                if (!AppMediaKinds.All.Contains(media.Kind)) Add($"media[{i}].kind", "Must be image, video or youtube.");
                else if (media.Kind == AppMediaKinds.YouTube ? YouTubeLinks.VideoIdIn(media.Url) is null : !IsMediaUrl(media.Url))
                {
                    Add($"media[{i}].url", media.Kind == AppMediaKinds.YouTube ? "Must be a YouTube video link." : "Must be an uploaded file or an http(s) link.");
                }
            }
        }

        var ids = request.CategoryIds ?? [];
        if (ids.Distinct().Count() != ids.Count) Add("categoryIds", "Each category can be chosen once.");
        else if (categoryIds is not null && ids.Any(id => !categoryIds.Contains(id))) Add("categoryIds", "That category doesn't exist any more. Reload the page.");

        var platforms = request.Platforms ?? [];
        if (platforms.Count > MaxPlatforms) Add("platforms", $"At most {MaxPlatforms}.");
        else if (platforms.Any(p => string.IsNullOrWhiteSpace(p) || p.Trim().Length > PlatformMaxLength)) Add("platforms", $"Each must be 1 to {PlatformMaxLength} characters.");
        else if (platforms.Select(p => p!.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).Count() != platforms.Count) Add("platforms", "Each can be added once.");

        var links = request.Links ?? [];
        if (links.Count > MaxLinks) Add("links", $"At most {MaxLinks} links.");
        else
        {
            for (var i = 0; i < links.Count; i++)
            {
                var link = links[i];
                var label = link?.Label?.Trim() ?? "";
                if (label.Length == 0) Add($"links[{i}].label", "Required, e.g. App Store.");
                else if (label.Length > LinkLabelMaxLength) Add($"links[{i}].label", $"Must be at most {LinkLabelMaxLength} characters.");
                var url = link?.Url?.Trim() ?? "";
                if (url.Length == 0) Add($"links[{i}].url", "Required.");
                else if (url.Length > AboutRules.UrlMaxLength || url.StartsWith('/') || !AboutRules.IsSafeUrl(url)) Add($"links[{i}].url", "Must be an http(s) link, e.g. https://apps.apple.com/….");
            }
        }

        return errors;
    }

    /// <summary>An upload of ours, or an absolute http(s) link.</summary>
    private static bool IsMediaUrl(string? url) =>
        FileRules.FileIdIn(url) is not null
        || (url is not null && url.Length <= AboutRules.UrlMaxLength && !url.Trim().StartsWith('/') && AboutRules.IsSafeUrl(url) && url.Trim().Length > 0);

    /// <summary>The admin's list of categories, in order. <paramref name="existingIds"/> are those in the database.</summary>
    public static Dictionary<string, string[]> ValidateCategories(IReadOnlyList<AppCategoryRequest?>? categories, IReadOnlyCollection<int> existingIds)
    {
        var errors = new Dictionary<string, string[]>();
        if (categories is null) return new() { [""] = ["The categories are required."] };
        if (categories.Count > MaxCategories) return new() { [""] = [$"At most {MaxCategories} categories."] };

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < categories.Count; i++)
        {
            var name = categories[i]?.Name?.Trim() ?? "";
            if (name.Length == 0) errors[$"[{i}].name"] = ["Required."];
            else if (name.Length > CategoryNameMaxLength) errors[$"[{i}].name"] = [$"Must be at most {CategoryNameMaxLength} characters."];
            else if (!seen.Add(name)) errors[$"[{i}].name"] = ["There's already a category with this name."];
            if (categories[i]?.Id is { } id && !existingIds.Contains(id)) errors[$"[{i}].id"] = ["That category doesn't exist any more. Reload the page."];
        }
        if (categories.Where(c => c?.Id is not null).GroupBy(c => c!.Id).Any(g => g.Count() > 1)) errors[""] = ["A category is listed twice."];
        return errors;
    }

    /// <summary>
    /// The order must name every app there is, each once, with whether What's new? may show it. An app added or
    /// deleted meanwhile (another tab) makes it out of date: nothing is saved, and the admin opens it again.
    /// </summary>
    public static Dictionary<string, string[]> ValidateOrder(IReadOnlyList<AppOrderRequest?>? order, IReadOnlyCollection<int> existingIds)
    {
        if (order is null) return new() { [""] = ["The order is required."] };
        var errors = new Dictionary<string, string[]>();
        for (var i = 0; i < order.Count; i++)
        {
            if (order[i]?.Id is null) errors[$"[{i}].id"] = ["Required."];
            if (order[i]?.ShowInWhatsNew is null) errors[$"[{i}].showInWhatsNew"] = ["Required."];
        }
        if (errors.Count > 0) return errors;

        var ids = order.Select(o => o!.Id!.Value).ToList();
        if (ids.Distinct().Count() != ids.Count) return new() { [""] = ["An app is listed twice."] };
        if (!ids.ToHashSet().SetEquals(existingIds)) return new() { [""] = [OrderOutOfDate] };
        return errors;
    }
}
