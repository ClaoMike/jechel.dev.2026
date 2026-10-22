using System.Globalization;
using System.Net;
using Portfolio.Api.Features.Updates;

namespace Portfolio.Api.Features.Meetings;

/// <summary>The admin's own words, by email: an answer to a contact message, or a note with a meeting decision.</summary>
public static class PersonalEmails
{
    public const string DefaultSubject = "Re: your message to jechel.dev";

    /// <param name="original">What they last wrote: quoted under the answer.</param>
    /// <param name="subject">The subject of the email that started the conversation, if one did: the answer is "Re: " it.</param>
    /// <param name="replyTo">Where their answer goes when not to the sender (while the site doesn't receive email). Optional.</param>
    /// <param name="inReplyTo">The Message-ID of their latest email, so the answer joins its thread. Optional.</param>
    public static EmailMessage Reply(string to, string name, string text, string original, string? subject = null, string? replyTo = null, string? inReplyTo = null) => new(
        to,
        ReplySubject(subject),
        Html($"""
            <p>Hi {Encode(name)},</p>
            {Paragraphs(text)}
            <p>Claudiu</p>
            <blockquote style="margin:24px 0 0;padding:8px 14px;border-left:3px solid #ccc;color:#666">{Paragraphs(original)}</blockquote>
            """),
        $"Hi {name},\n\n{text}\n\nClaudiu\n\n> {original.Replace("\n", "\n> ")}",
        ReplyTo: replyTo,
        InReplyTo: inReplyTo);

    /// <summary>"Re: " their subject (once), or <see cref="DefaultSubject"/>.</summary>
    public static string ReplySubject(string? subject)
    {
        var trimmed = subject?.Trim() ?? "";
        if (trimmed.Length == 0) return DefaultSubject;
        return trimmed.StartsWith("re:", StringComparison.OrdinalIgnoreCase) ? trimmed : $"Re: {trimmed}";
    }

    /// <param name="accepted">True for an accepted meeting, false for a declined one.</param>
    /// <param name="replyTo">Where their answer goes when not to the sender (while the site doesn't receive email). Optional.</param>
    public static EmailMessage MeetingNote(string to, string name, bool accepted, DateTimeOffset start, string? timeZone, string text, string? replyTo = null)
    {
        var when = FormatWhen(start, timeZone);
        var subject = accepted ? $"Our meeting on {when}" : $"About the meeting you asked for on {when}";
        return new EmailMessage(
            to,
            subject,
            Html($"""
                <p>Hi {Encode(name)},</p>
                {Paragraphs(text)}
                <p>Claudiu</p>
                <p style="color:#888;font-size:13px">{Encode(accepted ? $"The meeting is confirmed for {when}; Cal.com has sent the invitation." : $"The meeting on {when} won't go ahead.")}</p>
                """),
            $"Hi {name},\n\n{text}\n\nClaudiu\n\n{(accepted ? $"The meeting is confirmed for {when}; Cal.com has sent the invitation." : $"The meeting on {when} won't go ahead.")}",
            ReplyTo: replyTo);
    }

    /// <summary>"Tue 21 Oct, 14:30 (Europe/London)", in the attendee's time zone when it's known.</summary>
    public static string FormatWhen(DateTimeOffset start, string? timeZone)
    {
        var zone = TimeZoneInfo.Utc;
        if (timeZone is { Length: > 0 })
        {
            try
            {
                zone = TimeZoneInfo.FindSystemTimeZoneById(timeZone);
            }
            catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException)
            {
            }
        }
        var local = TimeZoneInfo.ConvertTime(start, zone);
        return $"{local.ToString("ddd d MMM, HH:mm", CultureInfo.InvariantCulture)} ({(zone == TimeZoneInfo.Utc ? "UTC" : timeZone)})";
    }

    private static string Html(string body) => $"""
        <!doctype html>
        <html><body style="margin:0;background:#f4f4f6">
        <div style="max-width:560px;margin:0 auto;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">
        <div style="background:#fff;border-radius:16px;padding:24px">
        {body}
        </div>
        </div>
        </body></html>
        """;

    private static string Paragraphs(string text) =>
        string.Concat(text.Replace("\r\n", "\n").Split("\n\n", StringSplitOptions.RemoveEmptyEntries).Select(p => $"<p>{Encode(p).Replace("\n", "<br>")}</p>"));

    private static string Encode(string text) => WebUtility.HtmlEncode(text);
}
