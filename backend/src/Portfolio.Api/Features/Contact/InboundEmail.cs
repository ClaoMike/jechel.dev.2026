using System.Net;
using System.Net.Http.Headers;
using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Settings;
using Portfolio.Api.Features.Updates;

namespace Portfolio.Api.Features.Contact;

/// <summary>An email Resend received, as the site reads it.</summary>
/// <param name="Dmarc">The receiving server's DMARC verdict: "pass", "fail", …; null when unknown.</param>
/// <param name="Automatic">Sent by a program (an out-of-office answer, a bounce), not by a person.</param>
/// <param name="Attachments">How many files came with it (not kept: text only).</param>
public record ReceivedEmail(string From, string? Subject, string? Text, string? Html, string? MessageId, string? Dmarc, bool Automatic, int Attachments);

/// <summary>Reads emails Resend received. Throws <see cref="ServiceException"/> when Resend refuses.</summary>
public interface IResendInbox
{
    Task<ReceivedEmail> GetAsync(string emailId, CancellationToken cancellationToken);
}

/// <summary>Resend's API: GET /emails/receiving/{id}.</summary>
public class ResendInbox(HttpClient http, IOptionsMonitor<EmailOptions> options) : IResendInbox
{
    public async Task<ReceivedEmail> GetAsync(string emailId, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"emails/receiving/{Uri.EscapeDataString(emailId)}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.CurrentValue.ResendApiKey.Trim());
        using var response = await http.SendAsync(request, cancellationToken);
        var text = await response.Content.ReadAsStringAsync(cancellationToken);
        JsonNode? json = null;
        try
        {
            json = text.Length > 0 ? JsonNode.Parse(text) : null;
        }
        catch (JsonException)
        {
        }
        if (!response.IsSuccessStatusCode)
        {
            throw new ServiceException($"Resend refused it: {InboundEmail.Text(json?["message"]) ?? $"{(int)response.StatusCode} {response.StatusCode}"}");
        }
        if (json is not JsonObject email) throw new ServiceException("Resend's answer wasn't an email.");

        var headers = email["headers"] as JsonObject;
        var automatic = InboundEmail.Text(headers?["auto-submitted"]) is { } auto && !auto.Equals("no", StringComparison.OrdinalIgnoreCase)
            || InboundEmail.Text(headers?["precedence"]) is "bulk" or "junk" or "auto_reply";
        return new ReceivedEmail(
            InboundEmail.Text(email["from"]) ?? "",
            InboundEmail.Text(email["subject"]),
            InboundEmail.Text(email["text"]),
            InboundEmail.Text(email["html"]),
            InboundEmail.Text(email["message_id"]),
            InboundEmail.Text(email["authentication"]?["dmarc"]),
            automatic,
            (email["attachments"] as JsonArray)?.Count ?? 0);
    }
}

/// <summary>
/// Emails to the site's address (the sender in Settings → Resend, e.g. hello@jechel.dev), received by Resend: each
/// joins the sender's latest conversation in the Contact inbox (their answer to the admin's email), or starts one.
/// Text only: what they quoted is left out, and attachments are only counted.
/// </summary>
public static class InboundEmail
{
    /// <summary>
    /// Resend's webhook (email.received), signed the Svix way: svix-id, svix-timestamp and svix-signature. Emails to
    /// other addresses (replies to updates@, say), failing DMARC, or sent by a program are dropped. 502 when the email
    /// can't be read from Resend, which then tries again.
    /// </summary>
    public static async Task<Results<Ok, BadRequest, UnauthorizedHttpResult, ProblemHttpResult>> Receive(
        HttpRequest request,
        PortfolioDbContext db,
        IOptionsMonitor<EmailOptions> options,
        IResendInbox inbox,
        IPhoneAlerts alerts,
        TimeProvider time,
        ILoggerFactory loggers,
        CancellationToken cancellationToken)
    {
        var settings = options.CurrentValue;
        var secret = settings.InboundWebhookSecret.Trim();
        if (secret.Length == 0) return TypedResults.Problem("Receiving email isn't set up: set the receiving webhook secret in Settings.", statusCode: StatusCodes.Status503ServiceUnavailable);

        if (await ReadLimitedAsync(request, MaxBodyBytes, cancellationToken) is not { } body) return TypedResults.BadRequest();
        if (!SignatureValid(request.Headers["svix-id"], request.Headers["svix-timestamp"], request.Headers["svix-signature"], body, secret, time.GetUtcNow())) return TypedResults.Unauthorized();

        JsonObject? root;
        try
        {
            root = JsonNode.Parse(body) as JsonObject;
        }
        catch (JsonException)
        {
            return TypedResults.BadRequest();
        }
        if (root is null) return TypedResults.BadRequest();
        if (Text(root["type"]) != "email.received") return TypedResults.Ok();
        var data = root["data"] as JsonObject;
        if (Text(data?["email_id"]) is not { Length: <= 100 } emailId) return TypedResults.BadRequest();

        var logger = loggers.CreateLogger(typeof(InboundEmail));
        var ours = settings.FromAddress;
        // Also when they put the address in Bcc, or it was forwarded here.
        string[] recipients = [.. Addresses(data!["to"]), .. Addresses(data["cc"]), .. Addresses(data["bcc"]), .. Addresses(data["received_for"])];
        if (ours.Length == 0 || !recipients.Contains(ours, StringComparer.OrdinalIgnoreCase))
        {
            logger.LogInformation("Dropped email {Id}: not to {Address}.", emailId, ours);
            return TypedResults.Ok();
        }
        if (await db.ContactMessages.AnyAsync(m => m.EmailId == emailId, cancellationToken) || await db.ContactReplies.AnyAsync(r => r.EmailId == emailId, cancellationToken)) return TypedResults.Ok();

        ReceivedEmail email;
        try
        {
            email = await inbox.GetAsync(emailId, cancellationToken);
        }
        catch (Exception e) when (e is ServiceException or HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(e, "Couldn't read email {Id} from Resend.", emailId);
            return TypedResults.Problem("Couldn't read the email from Resend.", statusCode: StatusCodes.Status502BadGateway);
        }

        if (!MailAddress.TryCreate(email.From, out var sender) || sender.Address.Equals(ours, StringComparison.OrdinalIgnoreCase))
        {
            logger.LogInformation("Dropped email {Id}: no sender.", emailId);
            return TypedResults.Ok();
        }
        if (email.Dmarc == "fail" || email.Automatic)
        {
            logger.LogInformation("Dropped email {Id} from {From}: {Why}.", emailId, sender.Address, email.Automatic ? "sent automatically" : "failed DMARC");
            return TypedResults.Ok();
        }

        var text = Cut(MessageOf(email), ContactEndpoints.ReplyMaxLength);
        var now = time.GetUtcNow();
        var address = sender.Address.ToLowerInvariant();
        var conversation = await db.ContactMessages
            .Where(m => m.Email.ToLower() == address)
            .OrderByDescending(m => m.LastActivityAt).ThenByDescending(m => m.Id)
            .FirstOrDefaultAsync(cancellationToken);
        string title;
        if (conversation is not null)
        {
            db.ContactReplies.Add(new ContactReply { MessageId = conversation.Id, Text = text, SentAt = now, FromVisitor = true, EmailId = emailId, EmailMessageId = Cut(email.MessageId, 500) });
            conversation.ReadAt = null;
            conversation.LastActivityAt = now;
            title = $"New reply from {conversation.Name}";
        }
        else
        {
            conversation = new ContactMessage
            {
                Name = Cut(sender.DisplayName.Trim() is { Length: > 0 } name ? name : sender.Address, ContactRules.NameMaxLength),
                Email = Cut(sender.Address, ContactRules.EmailMaxLength),
                Message = text,
                Subject = email.Subject is { } subject ? Cut(subject, 300) : null,
                ReceivedAt = now,
                LastActivityAt = now,
                EmailId = emailId,
                EmailMessageId = Cut(email.MessageId, 500),
            };
            db.ContactMessages.Add(conversation);
            title = $"New email from {conversation.Name}";
        }
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Resend sent it twice at once: the other one kept it.
            return TypedResults.Ok();
        }

        alerts.Send(new PhoneAlert(AlertKinds.Message, title, text, "/contact", AlertPriority.High, "envelope"));
        return TypedResults.Ok();
    }

    /// <summary>The webhook only names the email: anything this big isn't Resend's.</summary>
    public const int MaxBodyBytes = 256 * 1024;

    /// <summary>The body as text, reading no more than <paramref name="max"/> bytes; null when it's longer.</summary>
    private static async Task<string?> ReadLimitedAsync(HttpRequest request, int max, CancellationToken cancellationToken)
    {
        if (request.ContentLength > max) return null;
        using var buffer = new MemoryStream();
        var chunk = new byte[16 * 1024];
        int read;
        while ((read = await request.Body.ReadAsync(chunk, cancellationToken)) > 0)
        {
            if (buffer.Length + read > max) return null;
            buffer.Write(chunk, 0, read);
        }
        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    /// <summary>
    /// Svix's scheme: base64 HMAC-SHA256 of "{id}.{timestamp}.{body}", keyed with the secret after "whsec_" (base64);
    /// the header lists one or more "v1,{signature}". Older than 5 minutes (or as far ahead) is refused: no replays.
    /// </summary>
    public static bool SignatureValid(string? id, string? timestamp, string? signatures, string body, string secret, DateTimeOffset now)
    {
        if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(signatures) || !long.TryParse(timestamp, out var seconds)) return false;
        if (Math.Abs(now.ToUnixTimeSeconds() - seconds) > 5 * 60) return false;

        byte[] key;
        try
        {
            key = Convert.FromBase64String(secret.StartsWith("whsec_") ? secret[6..] : secret);
        }
        catch (FormatException)
        {
            key = Encoding.UTF8.GetBytes(secret);
        }
        var expected = Encoding.ASCII.GetBytes(Convert.ToBase64String(HMACSHA256.HashData(key, Encoding.UTF8.GetBytes($"{id}.{timestamp}.{body}"))));
        return signatures.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(s => s.StartsWith("v1,"))
            .Any(s => CryptographicOperations.FixedTimeEquals(expected, Encoding.ASCII.GetBytes(s[3..])));
    }

    /// <summary>What they wrote, without what they quoted; a note of any attachments, which aren't kept.</summary>
    public static string MessageOf(ReceivedEmail email)
    {
        var text = WithoutQuote(email.Text ?? HtmlToText(email.Html ?? ""));
        if (email.Attachments > 0)
        {
            var note = email.Attachments == 1 ? "(1 attachment, not shown: it's in Resend)" : $"({email.Attachments} attachments, not shown: they're in Resend)";
            text = text.Length > 0 ? $"{text}\n\n{note}" : note;
        }
        return text.Length > 0 ? text : "(No text)";
    }

    private const string Wrote = @"(wrote|a écrit|schrieb|escribió|ha scritto|a scris|schreef|napisał|escreveu)\s?:\s*$";

    // "On Thu, 22 Oct 2026 at 10:00, Claudiu <hello@jechel.dev> wrote:", in a few languages. It has an address or a year,
    // so a sentence that merely ends with "wrote:" stays.
    private static readonly Regex QuoteHeader = new($@"^(?=.*(@|\b(19|20)\d\d\b)).{{0,300}}\b{Wrote}", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    // Gmail wraps a long one at the address: "On Thu, 22 Oct 2026 at 10:00, Claudiu from jechel.dev <" then "hello@jechel.dev> wrote:".
    private static readonly Regex WrappedQuoteHeader = new($@"^\S*@\S*>?\s*{Wrote}", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    // A phone's own line under the message.
    private static readonly Regex SentFrom = new(@"^(Sent from my \w[\w ]*|Get Outlook for (iOS|Android)|Trimis de pe \w[\w ]*)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    /// <summary>
    /// The text above the quoted email it answers: up to its header (one line, or two as Gmail wraps it), Outlook's
    /// ("-----Original Message-----", or "From:" then "Sent:", after a line of underscores on the web), or a signature
    /// ("-- "). Trailing "&gt;" lines and a "Sent from my iPhone" go too.
    /// </summary>
    public static string WithoutQuote(string text)
    {
        var lines = text.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n').Select(l => l.TrimEnd()).ToList();
        string Next(int i) => lines.Skip(i + 1).FirstOrDefault(l => l.Trim().Length > 0)?.Trim() ?? "";
        var cut = lines.Count;
        for (var i = 0; i < lines.Count && cut == lines.Count; i++)
        {
            var line = lines[i].Trim();
            if (QuoteHeader.IsMatch(line)
                || (line.Any(char.IsDigit) && i + 1 < lines.Count && WrappedQuoteHeader.IsMatch(lines[i + 1].Trim()))
                || Regex.IsMatch(line, @"^-{2,}\s*Original Message\s*-{2,}$", RegexOptions.IgnoreCase)
                || (Regex.IsMatch(line, "^_{10,}$") && Next(i).StartsWith("From:", StringComparison.OrdinalIgnoreCase))
                || (line.StartsWith("From:", StringComparison.OrdinalIgnoreCase) && i + 1 < lines.Count && Regex.IsMatch(lines[i + 1].Trim(), "^(Sent|Date):", RegexOptions.IgnoreCase))
                || lines[i] == "--")
            {
                cut = i;
            }
        }
        lines = lines[..cut];
        bool Trailing(string l) => l.Trim().Length == 0 || l.TrimStart().StartsWith('>') || SentFrom.IsMatch(l.Trim());
        while (lines.Count > 0 && Trailing(lines[^1])) lines.RemoveAt(lines.Count - 1);
        return Regex.Replace(string.Join('\n', lines), @"\n{3,}", "\n\n").Trim();
    }

    /// <summary>Plain text from an email's HTML, up to the quoted email (Gmail's gmail_quote, or a blockquote).</summary>
    public static string HtmlToText(string html)
    {
        var quote = Regex.Match(html, @"<(div|blockquote)[^>]*(gmail_quote|type=""cite"")|<blockquote", RegexOptions.IgnoreCase);
        if (quote.Success) html = html[..quote.Index];
        html = Regex.Replace(html, @"<(head|style|script)[^>]*>.*?</\1>", "", RegexOptions.IgnoreCase | RegexOptions.Singleline);
        html = Regex.Replace(html, @"<br\s*/?>|</(p|div|li|h\d|tr)>", "\n", RegexOptions.IgnoreCase);
        html = Regex.Replace(html, "<[^>]+>", "");
        var text = WebUtility.HtmlDecode(html).Replace(' ', ' ');
        return Regex.Replace(string.Join('\n', text.Split('\n').Select(l => l.Trim())), @"\n{3,}", "\n\n").Trim();
    }

    /// <summary>The addresses in a JSON array of "Name &lt;address&gt;" or plain addresses.</summary>
    private static IEnumerable<string> Addresses(JsonNode? node) =>
        (node as JsonArray ?? []).Select(Text).OfType<string>().Select(a => MailAddress.TryCreate(a, out var address) ? address.Address : a);

    internal static string? Text(JsonNode? node) => node is JsonValue value && value.TryGetValue<string>(out var s) && s.Trim().Length > 0 ? s.Trim() : null;

    [return: System.Diagnostics.CodeAnalysis.NotNullIfNotNull(nameof(text))]
    private static string? Cut(string? text, int max) => text is null || text.Length <= max ? text : text[..max];
}
