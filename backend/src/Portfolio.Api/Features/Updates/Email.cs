using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Options;

namespace Portfolio.Api.Features.Updates;

/// <param name="UnsubscribeUrl">Sent as List-Unsubscribe (one click, RFC 8058), which Gmail and Yahoo require for bulk mail. Optional.</param>
public record EmailMessage(string To, string Subject, string Html, string Text, string? UnsubscribeUrl = null);

public interface IEmailSender
{
    /// <summary>Throws when it couldn't be sent.</summary>
    Task SendAsync(EmailMessage message, CancellationToken cancellationToken);
}

/// <summary>The "Email" configuration section. Without a Resend key, emails are only written to the log (fine locally).</summary>
public class EmailOptions
{
    public const string Section = "Email";

    /// <summary>A <see href="https://resend.com">Resend</see> API key (a secret).</summary>
    public string ResendApiKey { get; set; } = "";

    /// <summary>The sender; its domain must be verified in Resend.</summary>
    public string From { get; set; } = "jechel.dev <updates@jechel.dev>";

    public bool IsConfigured => ResendApiKey.Trim().Length > 0;
}

/// <summary>Sends through Resend's HTTP API.</summary>
public class ResendEmailSender(HttpClient http, IOptions<EmailOptions> options) : IEmailSender
{
    public static readonly Uri BaseAddress = new("https://api.resend.com/");

    public async Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        var body = new Dictionary<string, object>
        {
            ["from"] = options.Value.From,
            ["to"] = new[] { message.To },
            ["subject"] = message.Subject,
            ["html"] = message.Html,
            ["text"] = message.Text,
        };
        if (message.UnsubscribeUrl is { } unsubscribe)
        {
            body["headers"] = new Dictionary<string, string>
            {
                ["List-Unsubscribe"] = $"<{unsubscribe}>",
                ["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click",
            };
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, "emails") { Content = JsonContent.Create(body) };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.Value.ResendApiKey.Trim());
        using var response = await http.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
    }
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
