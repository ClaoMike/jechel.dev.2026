using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using Portfolio.Api.Features.Settings;

namespace Portfolio.Api.Features.Updates;

/// <param name="UnsubscribeUrl">Sent as List-Unsubscribe (one click, RFC 8058), which Gmail and Yahoo require for bulk mail. Optional.</param>
/// <param name="ReplyTo">Where answers go, when not to the sender. Optional.</param>
/// <param name="FromUpdates">An email to subscribers: sent from <see cref="EmailOptions.UpdatesFrom"/> (when set), an address that takes no replies.</param>
/// <param name="Images">Pictures sent inside the email, shown by the HTML as <c>cid:</c> + their id: they show without the mail app fetching anything.</param>
/// <param name="InReplyTo">The Message-ID of the email this answers: their mail app shows both in one thread. Optional.</param>
public record EmailMessage(string To, string Subject, string Html, string Text, string? UnsubscribeUrl = null, string? ReplyTo = null, bool FromUpdates = false, IReadOnlyList<InlineImage>? Images = null, string? InReplyTo = null);

/// <summary>A picture inside an email: the HTML shows it as <c>cid:{ContentId}</c>.</summary>
public record InlineImage(string ContentId, string FileName, string ContentType, byte[] Content);

public interface IEmailSender
{
    /// <summary>Throws when it couldn't be sent.</summary>
    Task SendAsync(EmailMessage message, CancellationToken cancellationToken);
}

/// <summary>The "Email" configuration section (also editable in the Settings tab). Without a Resend key, emails are only written to the log.</summary>
public class EmailOptions
{
    public const string Section = "Email";

    /// <summary>A <see href="https://resend.com">Resend</see> API key (a secret).</summary>
    public string ResendApiKey { get; set; } = "";

    /// <summary>
    /// The sender; its domain must be verified in Resend. Until one is, Resend's own address works, but
    /// only for emails to the Resend account's own address (enough to try subscribing yourself).
    /// </summary>
    public string From { get; set; } = "jechel.dev <onboarding@resend.dev>";

    /// <summary>
    /// The sender of the emails to subscribers (confirmations and updates), e.g. "jechel.dev &lt;updates@jechel.dev&gt;":
    /// an address with no mailbox, so replies go nowhere, while <see cref="From"/> can be one people answer. Empty: <see cref="From"/>.
    /// </summary>
    public string UpdatesFrom { get; set; } = "";

    /// <summary>
    /// The signing secret ("whsec_…") of the Resend webhook that reports emails received at <see cref="From"/>'s
    /// address. Until it's set, nothing is received, and answers to visitors ask them to reply to the admin's own address.
    /// </summary>
    public string InboundWebhookSecret { get; set; } = "";

    public bool IsReceiving => InboundWebhookSecret.Trim().Length > 0;

    /// <summary>The address in <see cref="From"/>, e.g. "hello@jechel.dev": emails to it land in the Contact inbox.</summary>
    public string FromAddress => System.Net.Mail.MailAddress.TryCreate(From.Trim(), out var address) ? address.Address : "";

    /// <summary>Who <paramref name="message"/> is from.</summary>
    public string SenderOf(EmailMessage message) => message.FromUpdates && UpdatesFrom.Trim() is { Length: > 0 } updates ? updates : From;

    public bool IsConfigured => ResendApiKey.Trim().Length > 0;
}

/// <summary>Sends through Resend's HTTP API.</summary>
public class ResendEmailSender(HttpClient http, IOptionsMonitor<EmailOptions> options) : IEmailSender
{
    public static readonly Uri BaseAddress = new("https://api.resend.com/");

    public async Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        var body = new Dictionary<string, object>
        {
            ["from"] = options.CurrentValue.SenderOf(message),
            ["to"] = new[] { message.To },
            ["subject"] = message.Subject,
            ["html"] = message.Html,
            ["text"] = message.Text,
        };
        if (message.ReplyTo is { Length: > 0 } replyTo) body["reply_to"] = replyTo;
        if (message.Images is { Count: > 0 } images)
        {
            body["attachments"] = images.Select(i => new Dictionary<string, string>
            {
                ["filename"] = i.FileName,
                ["content"] = Convert.ToBase64String(i.Content),
                ["content_type"] = i.ContentType,
                ["content_id"] = i.ContentId,
            }).ToArray();
        }
        var headers = new Dictionary<string, string>();
        if (message.InReplyTo is { Length: > 0 } inReplyTo)
        {
            headers["In-Reply-To"] = inReplyTo;
            headers["References"] = inReplyTo;
        }
        else
        {
            // A new id for every other email, so Gmail never stacks it in one conversation with an earlier one of the same subject
            // (a test confirmation and the real one, say), where the older message's button is easy to press by mistake.
            headers["X-Entity-Ref-ID"] = Guid.NewGuid().ToString("N");
        }
        if (message.UnsubscribeUrl is { } unsubscribe)
        {
            headers["List-Unsubscribe"] = $"<{unsubscribe}>";
            headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
        }
        body["headers"] = headers;

        using var request = new HttpRequestMessage(HttpMethod.Post, "emails") { Content = JsonContent.Create(body) };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.CurrentValue.ResendApiKey.Trim());
        using var response = await http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            // Resend says why, e.g. that the sender's domain isn't verified.
            var answer = await response.Content.ReadAsStringAsync(cancellationToken);
            var reason = TryRead(answer) ?? $"{(int)response.StatusCode} {response.StatusCode}";
            throw new ServiceException($"Resend refused it: {reason}");
        }
    }

    private static string? TryRead(string body)
    {
        try
        {
            return JsonNode.Parse(body)?["message"]?.GetValue<string>();
        }
        catch (System.Text.Json.JsonException)
        {
            return null;
        }
    }
}

/// <summary>
/// Resend while an API key is set (in the configuration or the Settings tab), otherwise the log.
/// Checked on every email, so a key saved in the Settings tab applies at once.
/// </summary>
public class SwitchingEmailSender(ResendEmailSender resend, LogEmailSender log, IOptionsMonitor<EmailOptions> options) : IEmailSender
{
    public bool IsConfigured => options.CurrentValue.IsConfigured;

    public Task SendAsync(EmailMessage message, CancellationToken cancellationToken) =>
        IsConfigured ? resend.SendAsync(message, cancellationToken) : log.SendAsync(message, cancellationToken);
}

/// <summary>Writes emails to the log instead of sending them: for local development, before Resend is set up.</summary>
public class LogEmailSender(ILogger<LogEmailSender> logger) : IEmailSender
{
    public Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        logger.LogInformation("Email (Email:ResendApiKey isn't set) to {To}: {Subject}\n{Text}", message.To, message.Subject, message.Text);
        return Task.CompletedTask;
    }
}
