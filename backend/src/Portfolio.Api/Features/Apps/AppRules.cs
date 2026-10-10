using Portfolio.Api.Features.About;
using Portfolio.Api.Features.Files;

namespace Portfolio.Api.Features.Apps;

/// <summary>Validation of an app. Error keys are JSON paths, e.g. "media[2].url".</summary>
public static class AppRules
{
    public const int TitleMaxLength = 120;
    public const int DescriptionMaxLength = 5000;
    public const int MaxMedia = 30;

    public static Dictionary<string, string[]> Validate(AppRequest? request)
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
                if (media is null || FileRules.FileIdIn(media.Url) is null) Add($"media[{i}].url", "Must be an uploaded file.");
                else if (!AppMediaKinds.All.Contains(media.Kind)) Add($"media[{i}].kind", "Must be image or video.");
            }
        }

        return errors;
    }
}
