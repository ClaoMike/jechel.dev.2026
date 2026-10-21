using System.Net;
using System.Text;
using Portfolio.Api.Features.Alerts;

namespace Portfolio.Api.Features.Updates;

/// <summary>A new app or video, as an update email shows it.</summary>
/// <param name="Url">Where its button leads (absolute).</param>
/// <param name="ImageUrl">An absolute URL, or null for no picture.</param>
public record UpdateItem(string Title, string Summary, string Url, string? ImageUrl);

/// <summary>
/// The emails subscribers get, as HTML and plain text, in the admin's wording (<see cref="UpdateEmailWording"/>)
/// and the jechel.dev look. Every value put into the HTML is encoded. They're sent from the updates sender,
/// whose address takes no replies.
/// </summary>
public static class UpdateEmails
{
    public static EmailMessage Confirmation(string to, string confirmUrl, UpdateEmailWording wording, SiteOptions site)
    {
        var words = wording.Confirm;
        var note = words.Note.Length == 0 ? "" : $"""<div style="color:{Grey}">{Paragraphs(words.Note, site)}</div>""";
        return new EmailMessage(
            to,
            words.Subject,
            Layout(
                site,
                $"""
                {Paragraphs(words.Intro, site)}
                <p style="margin:24px 0">{Button(words.Button, confirmUrl)}</p>
                {note}
                """,
                Footer(wording.Footer, site, unsubscribeUrl: null)),
            Join(PlainText(words.Intro, site), $"{words.Button}: {confirmUrl}", PlainText(words.Note, site), PlainFooter(wording.Footer, site, unsubscribeUrl: null)),
            FromUpdates: true);
    }

    /// <param name="what">"app" or "video": whose wording it uses.</param>
    public static EmailMessage NewItem(string to, string what, UpdateItem item, string unsubscribeUrl, UpdateEmailWording wording, SiteOptions site)
    {
        var words = what == UpdatesAnnouncer.VideoKind ? wording.Video : wording.App;
        var heading = Fill(words.Heading, item.Title);
        var picture = item.ImageUrl is null ? "" : $"""<p><a href="{Attr(item.Url)}"><img src="{Attr(item.ImageUrl)}" alt="" width="512" style="display:block;max-width:100%;height:auto;border:0;border-radius:12px"></a></p>""";
        return new EmailMessage(
            to,
            Fill(words.Subject, item.Title),
            Layout(
                site,
                $"""
                <p style="color:{Grey};margin:0">{Html(heading)}</p>
                <h1 style="font-size:22px;line-height:1.3;margin:4px 0 16px">{Html(item.Title)}</h1>
                {picture}
                <p>{Html(item.Summary)}</p>
                <p style="margin:24px 0 0">{Button(words.Button, item.Url)}</p>
                """,
                Footer(wording.Footer, site, unsubscribeUrl)),
            Join($"{heading}\n{item.Title}", item.Summary, $"{words.Button}: {item.Url}", PlainFooter(wording.Footer, site, unsubscribeUrl)),
            unsubscribeUrl,
            FromUpdates: true);
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

    /// <summary>Grey text that still reads well (over 5:1) on the white card and the page around it.</summary>
    private const string Grey = "#5f5e70";

    private static string Fill(string text, string title) => text.Replace(UpdateEmailRules.TitlePlaceholder, title);

    /// <summary>
    /// The jechel.dev look: a dark header with the icon and the name in pink and violet, a sunset stripe,
    /// a white card. Email apps ignore much of CSS, so every gradient sits on a plain colour of its own.
    /// </summary>
    private static string Layout(SiteOptions site, string body, string footer)
    {
        var home = site.UrlFor("/");
        return $"""
            <!doctype html>
            <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
            <body style="margin:0;background:#f3f0f8">
            <div style="max-width:560px;margin:0 auto;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">
            <div style="background:#ffffff;border-radius:16px;overflow:hidden">
            <div style="background-color:#1c0a33;background-image:linear-gradient(135deg,#2a0f4d,#14061f);padding:16px 24px">
            <a href="{Attr(home)}" style="text-decoration:none;font-size:20px;font-weight:800;letter-spacing:-0.01em"><img src="{Attr(site.UrlFor("/apple-touch-icon.png"))}" width="32" height="32" alt="" style="vertical-align:middle;border:0;border-radius:8px;margin-right:10px"><span style="color:#ff3ea5;vertical-align:middle">jechel</span><span style="color:#b98cff;vertical-align:middle">.dev</span></a>
            </div>
            <div style="height:4px;line-height:4px;font-size:0;background-color:#d91289;background-image:linear-gradient(90deg,#ff3ea5,#ff8a5c,#ffd36e,#ff5fc4,#9b5cff,#4fa3ff)">&nbsp;</div>
            <div style="padding:24px">
            {body}
            </div>
            </div>
            {footer}
            </div>
            </body></html>
            """;
    }

    private static string Footer(FooterWording words, SiteOptions site, string? unsubscribeUrl)
    {
        var parts = new List<string>();
        if (unsubscribeUrl is not null)
        {
            var reason = words.Reason.Length == 0 ? "" : $"{Inline(words.Reason, site)} ";
            parts.Add($"""<p style="margin:0 0 8px">{reason}<a href="{Attr(unsubscribeUrl)}" style="color:{Grey}">Unsubscribe</a></p>""");
        }
        if (words.NoReply.Length > 0) parts.Add($"""<p style="margin:0">{Inline(words.NoReply, site)}</p>""");
        return parts.Count == 0 ? "" : $"""<div style="color:{Grey};font-size:12px;line-height:1.5;margin-top:20px;padding:0 12px;text-align:center">{string.Concat(parts)}</div>""";
    }

    private static string PlainFooter(FooterWording words, SiteOptions site, string? unsubscribeUrl)
    {
        var lines = new List<string>();
        if (unsubscribeUrl is not null) lines.Add(Join(PlainText(words.Reason, site), $"Unsubscribe: {unsubscribeUrl}"));
        if (words.NoReply.Length > 0) lines.Add(PlainText(words.NoReply, site));
        return lines.Count == 0 ? "" : "--\n" + string.Join("\n\n", lines);
    }

    private static string Button(string label, string url) =>
        $"""<a href="{Attr(url)}" style="display:inline-block;background-color:#d91289;background-image:linear-gradient(90deg,#d91289,#9942f0);color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:700">{Html(label)}</a>""";

    /// <summary>Paragraphs split by a blank line; a single line break stays one.</summary>
    private static string Paragraphs(string text, SiteOptions site) =>
        string.Concat(text.Split("\n\n", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(p => $"<p>{Inline(p, site)}</p>"));

    /// <summary>Encoded text, with its [text](url) links as links (paths on this site made absolute) and line breaks kept.</summary>
    private static string Inline(string text, SiteOptions site)
    {
        var html = new StringBuilder();
        var at = 0;
        foreach (System.Text.RegularExpressions.Match link in About.AboutRules.MarkdownLinkPattern().Matches(text))
        {
            html.Append(Html(text[at..link.Index]));
            html.Append($"""<a href="{Attr(Absolute(link.Groups[2].Value, site))}" style="color:#b0106f">{Html(link.Groups[1].Value)}</a>""");
            at = link.Index + link.Length;
        }
        html.Append(Html(text[at..]));
        return html.ToString().Replace("\n", "<br>");
    }

    /// <summary>The text with each link written as "text (url)".</summary>
    private static string PlainText(string text, SiteOptions site) =>
        About.AboutRules.MarkdownLinkPattern().Replace(text, m => $"{m.Groups[1].Value} ({Absolute(m.Groups[2].Value, site)})");

    private static string Absolute(string url, SiteOptions site) => url.StartsWith('/') ? site.UrlFor(url) : url;

    /// <summary>The non-empty parts, a blank line apart.</summary>
    private static string Join(params string[] parts) => string.Join("\n\n", parts.Where(p => p.Length > 0));

    private static string Html(string text) => WebUtility.HtmlEncode(text);
    private static string Attr(string text) => WebUtility.HtmlEncode(text);
}
