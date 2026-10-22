using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using Portfolio.Api.Features.Settings;

namespace Portfolio.Api.Features.Meetings;

/// <summary>The "Cal" configuration section (also editable in the Settings tab).</summary>
public class CalOptions
{
    public const string Section = "Cal";

    /// <summary>The booking page, as "username/event" (or its cal.com link): the link the admin sends to people they invite.</summary>
    public string Link { get; set; } = "";

    /// <summary>"https://cal.com/username/event", or "" when <see cref="Link"/> isn't one.</summary>
    public string BookingUrl => NormalizeLink(Link) is { Length: > 0 } link ? $"https://cal.com/{link}" : "";

    /// <summary>A Cal.com API key ("cal_live_…"), to accept and decline requests from this site.</summary>
    public string ApiKey { get; set; } = "";

    /// <summary>The secret set on the Cal.com webhook. Until it's set the webhook answers 503.</summary>
    public string WebhookSecret { get; set; } = "";

    /// <summary>"username/event" from either form, or "" when it isn't one.</summary>
    public static string NormalizeLink(string? value)
    {
        var link = (value ?? "").Trim();
        if (Uri.TryCreate(link, UriKind.Absolute, out var uri))
        {
            if (uri.Scheme is not ("https" or "http") || !(uri.Host == "cal.com" || uri.Host.EndsWith(".cal.com"))) return "";
            link = uri.AbsolutePath;
        }
        link = link.Trim('/');
        return System.Text.RegularExpressions.Regex.IsMatch(link, @"^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)?$") ? link : "";
    }
}

/// <summary>What the site asks Cal.com to do with a booking. Throws <see cref="ServiceException"/> with Cal.com's reason when it refuses.</summary>
public interface ICalClient
{
    Task ConfirmAsync(string uid, CancellationToken cancellationToken);
    Task DeclineAsync(string uid, string? reason, CancellationToken cancellationToken);

    /// <summary>Checks the API key; returns the account's username.</summary>
    Task<string> WhoAmIAsync(CancellationToken cancellationToken);
}

/// <summary>Cal.com's API v2.</summary>
public class CalClient(HttpClient http, IOptionsMonitor<CalOptions> options) : ICalClient
{
    public static readonly Uri BaseAddress = new("https://api.cal.com/v2/");

    /// <summary>The version the confirm and decline endpoints are documented with; older ones behave differently.</summary>
    public const string BookingsApiVersion = "2026-02-25";

    public Task ConfirmAsync(string uid, CancellationToken cancellationToken) =>
        SendAsync(HttpMethod.Post, $"bookings/{Uri.EscapeDataString(uid)}/confirm", null, cancellationToken);

    public Task DeclineAsync(string uid, string? reason, CancellationToken cancellationToken) =>
        SendAsync(HttpMethod.Post, $"bookings/{Uri.EscapeDataString(uid)}/decline", string.IsNullOrWhiteSpace(reason) ? new { } : new { reason }, cancellationToken);

    public async Task<string> WhoAmIAsync(CancellationToken cancellationToken)
    {
        var body = await SendAsync(HttpMethod.Get, "me", null, cancellationToken);
        var data = (body as JsonObject)?["data"] as JsonObject;
        return Text(data?["username"]) ?? Text(data?["email"]) ?? "your account";
    }

    private async Task<JsonNode?> SendAsync(HttpMethod method, string path, object? body, CancellationToken cancellationToken)
    {
        var key = options.CurrentValue.ApiKey.Trim();
        if (key.Length == 0) throw new ServiceException("Set the Cal.com API key in Settings first.");

        using var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        request.Headers.Add("cal-api-version", BookingsApiVersion);
        if (body is not null) request.Content = JsonContent.Create(body);

        using var response = await http.SendAsync(request, cancellationToken);
        var text = await response.Content.ReadAsStringAsync(cancellationToken);
        JsonNode? json = null;
        try
        {
            json = text.Length > 0 ? JsonNode.Parse(text) : null;
        }
        catch (System.Text.Json.JsonException)
        {
        }
        if (!response.IsSuccessStatusCode)
        {
            var answer = json as JsonObject;
            var reason = Text((answer?["error"] as JsonObject)?["message"]) ?? Text(answer?["message"]) ?? $"{(int)response.StatusCode} {response.StatusCode}";
            throw new ServiceException($"Cal.com refused it: {reason}");
        }
        return json;
    }

    /// <summary>A text value; null for anything else (a number, an object), which isn't something to show.</summary>
    private static string? Text(JsonNode? node) => node is JsonValue value && value.TryGetValue<string>(out var text) ? text : null;
}
