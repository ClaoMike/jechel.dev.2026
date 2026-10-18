using System.Net;

namespace Portfolio.Api.Features.Updates;

/// <summary>The emails subscribers get, as HTML and plain text. Every value put into the HTML is encoded.</summary>
public static class UpdateEmails
{
    public static EmailMessage Confirmation(string to, string confirmUrl) => new(
        to,
        "Confirm your jechel.dev updates",
        Layout(
            $"""
            <p>Hi,</p>
            <p>Someone (hopefully you) asked to get an email from <strong>jechel.dev</strong> when there's a new app or video.</p>
            <p>{Button("Yes, send me updates", confirmUrl)}</p>
            <p style="color:#666">If it wasn't you, ignore this email: you won't hear from us again.</p>
            """),
        $"""
        Someone (hopefully you) asked to get an email from jechel.dev when there's a new app or video.

        Confirm: {confirmUrl}

        If it wasn't you, ignore this email: you won't hear from us again.
        """);

    /// <param name="What">"app" or "video", for the wording.</param>
    /// <param name="ImageUrl">An absolute URL, or null for no picture.</param>
    public static EmailMessage NewItem(string to, string what, string title, string summary, string url, string? imageUrl, string unsubscribeUrl)
    {
        var heading = what == "video" ? "A new video is up" : "A new app is out";
        var action = what == "video" ? "Watch it" : "Take a look";
        var picture = imageUrl is null ? "" : $"""<p><a href="{Attr(url)}"><img src="{Attr(imageUrl)}" alt="" width="520" style="max-width:100%;border-radius:12px"></a></p>""";
        return new EmailMessage(
            to,
            $"{heading}: {title}",
            Layout(
                $"""
                <p style="color:#666;margin:0">{Html(heading)}</p>
                <h1 style="font-size:22px;margin:4px 0 16px">{Html(title)}</h1>
                {picture}
                <p>{Html(summary)}</p>
                <p>{Button(action, url)}</p>
                """,
                unsubscribeUrl),
            $"""
            {heading}: {title}

            {summary}

            {action}: {url}

            Unsubscribe: {unsubscribeUrl}
            """,
            unsubscribeUrl);
    }

    /// <summary>The start of a description, without [text](url) link syntax, cut at a word.</summary>
    public static string Summary(string description, int max = 300)
    {
        var text = About.AboutRules.MarkdownLinkPattern().Replace(description, "$1").Trim();
        if (text.Length <= max) return text;
        var cut = text[..max];
        var space = cut.LastIndexOf(' ');
        return (space > max / 2 ? cut[..space] : cut).TrimEnd() + "…";
    }

    private static string Layout(string body, string? unsubscribeUrl = null)
    {
        var footer = unsubscribeUrl is null
            ? ""
            : $"""<p style="color:#888;font-size:12px;margin-top:32px">You get these because you subscribed on jechel.dev. <a href="{Attr(unsubscribeUrl)}" style="color:#888">Unsubscribe</a></p>""";
        return $"""
            <!doctype html>
            <html><body style="margin:0;background:#f4f4f6">
            <div style="max-width:560px;margin:0 auto;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">
            <div style="background:#fff;border-radius:16px;padding:24px">
            {body}
            </div>
            {footer}
            </div>
            </body></html>
            """;
    }

    private static string Button(string label, string url) =>
        $"""<a href="{Attr(url)}" style="display:inline-block;background:#1a73e8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600">{Html(label)}</a>""";

    private static string Html(string text) => WebUtility.HtmlEncode(text);
    private static string Attr(string text) => WebUtility.HtmlEncode(text);
}
