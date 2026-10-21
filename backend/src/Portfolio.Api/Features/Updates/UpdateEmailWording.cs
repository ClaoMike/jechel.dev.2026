using System.Text.RegularExpressions;
using Portfolio.Api.Features.About;

namespace Portfolio.Api.Features.Updates;

/// <summary>
/// The words of the emails subscribers get, edited in the Community tab. Longer texts may hold paragraphs
/// (split by a blank line) and [text](url) links; subjects and headings may hold {title}, the new item's title.
/// </summary>
public record UpdateEmailWording(ConfirmWording Confirm, ItemWording Video, ItemWording App, FooterWording Footer);

/// <summary>The email that asks a new subscriber to confirm.</summary>
/// <param name="Note">Under the button, in grey. Optional.</param>
public record ConfirmWording(string Subject, string Intro, string Button, string Note);

/// <summary>The email about a new video or app.</summary>
/// <param name="Heading">Above the item's title, in grey.</param>
public record ItemWording(string Subject, string Heading, string Button);

/// <summary>Under every email, in small grey text. Both optional.</summary>
/// <param name="Reason">Why they get it, before the Unsubscribe link (update emails only).</param>
/// <param name="NoReply">That replies aren't read, and where to write instead.</param>
public record FooterWording(string Reason, string NoReply);

/// <param name="UpdatedAt">Null while the defaults apply (never saved).</param>
public record UpdateEmailsDocument(UpdateEmailWording Wording, UpdateEmailWording Defaults, DateTimeOffset? UpdatedAt);

/// <summary>The wording until the admin saves their own: what the emails always said, plus the line about replies.</summary>
public static class UpdateEmailDefaults
{
    public static readonly UpdateEmailWording Wording = new(
        new ConfirmWording(
            "Confirm your jechel.dev updates",
            "Hi,\n\nSomeone (hopefully you) asked to get an email from jechel.dev when there's a new app or video.",
            "Yes, send me updates",
            "If it wasn't you, ignore this email: you won't hear from us again."),
        new ItemWording("A new video is up: {title}", "A new video is up", "Watch it"),
        new ItemWording("A new app is out: {title}", "A new app is out", "Take a look"),
        new FooterWording(
            "You get these because you subscribed on jechel.dev.",
            "Replies to this address aren't read. To get in touch, use the [contact page](/contact)."));
}

/// <summary>Validation and normalisation of the wording. Error keys are the fields' JSON paths, e.g. "video.subject".</summary>
public static partial class UpdateEmailRules
{
    public const int SubjectMaxLength = 150;
    public const int ButtonMaxLength = 40;
    public const int TextMaxLength = 1000;

    /// <summary>The one thing that can be filled in: the new item's title.</summary>
    public const string TitlePlaceholder = "{title}";

    public static Dictionary<string, string[]> Validate(UpdateEmailWording? wording)
    {
        var errors = new Dictionary<string, string[]>();
        void Add(string key, string message) => errors.TryAdd(key, [message]);

        if (wording?.Confirm is null || wording.Video is null || wording.App is null || wording.Footer is null)
        {
            Add("", "Every email's wording is required.");
            return errors;
        }

        Line(wording.Confirm.Subject, "confirm.subject", SubjectMaxLength, title: false, Add);
        Text(wording.Confirm.Intro, "confirm.intro", required: true, Add);
        Line(wording.Confirm.Button, "confirm.button", ButtonMaxLength, title: false, Add);
        Text(wording.Confirm.Note, "confirm.note", required: false, Add);
        foreach (var (item, key) in new[] { (wording.Video, "video"), (wording.App, "app") })
        {
            Line(item.Subject, $"{key}.subject", SubjectMaxLength, title: true, Add);
            Line(item.Heading, $"{key}.heading", SubjectMaxLength, title: true, Add);
            Line(item.Button, $"{key}.button", ButtonMaxLength, title: false, Add);
        }
        Text(wording.Footer.Reason, "footer.reason", required: false, Add);
        Text(wording.Footer.NoReply, "footer.noReply", required: false, Add);
        return errors;
    }

    /// <summary>Trimmed, with Windows line ends made plain. Call after <see cref="Validate"/> found nothing.</summary>
    public static UpdateEmailWording Normalize(UpdateEmailWording wording)
    {
        static string Clean(string value) => value.Replace("\r\n", "\n").Trim();
        static ItemWording Item(ItemWording item) => new(Clean(item.Subject), Clean(item.Heading), Clean(item.Button));
        return new UpdateEmailWording(
            new ConfirmWording(Clean(wording.Confirm.Subject), Clean(wording.Confirm.Intro), Clean(wording.Confirm.Button), Clean(wording.Confirm.Note)),
            Item(wording.Video),
            Item(wording.App),
            new FooterWording(Clean(wording.Footer.Reason), Clean(wording.Footer.NoReply)));
    }

    /// <summary>A subject, heading or button: one line, required, {title} only where it's known.</summary>
    private static void Line(string? value, string key, int maxLength, bool title, Action<string, string> add)
    {
        var text = value?.Trim() ?? "";
        if (text.Length == 0) add(key, "Required.");
        else if (text.Length > maxLength) add(key, $"Must be at most {maxLength} characters.");
        else if (text.Contains('\n') || text.Contains('\r')) add(key, "Must be one line.");
        else CheckPlaceholders(text, key, title, add);
    }

    /// <summary>A longer text: paragraphs and links to http(s) addresses or this site's pages, no placeholders.</summary>
    private static void Text(string? value, string key, bool required, Action<string, string> add)
    {
        var text = value?.Trim() ?? "";
        if (required && text.Length == 0) add(key, "Required.");
        else if (text.Length > TextMaxLength) add(key, $"Must be at most {TextMaxLength} characters.");
        else if (AboutRules.LinksIn(text).Any(url => !AboutRules.IsSafeUrl(url) || url.Length > AboutRules.UrlMaxLength)) add(key, "Links must be http(s) links, or paths on this site starting with /.");
        else CheckPlaceholders(text, key, title: false, add);
    }

    private static void CheckPlaceholders(string text, string key, bool title, Action<string, string> add)
    {
        var unknown = Placeholder().Matches(text).Select(m => m.Value).FirstOrDefault(p => !(title && p == TitlePlaceholder));
        if (unknown is null) return;
        add(key, title ? $"Only {TitlePlaceholder} can be filled in; remove {unknown}." : $"Nothing is filled in here; remove {unknown}.");
    }

    [GeneratedRegex(@"\{[^{}\s]*\}")]
    private static partial Regex Placeholder();
}
