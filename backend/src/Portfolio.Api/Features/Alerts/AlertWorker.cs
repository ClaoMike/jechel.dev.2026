using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Options;

namespace Portfolio.Api.Features.Alerts;

/// <summary>
/// The "Alerts" configuration section (also editable in the Settings tab): where phone alerts go.
/// They're sent with <see href="https://ntfy.sh">ntfy</see>: install the ntfy app, subscribe to the
/// topic, done. Until <see cref="NtfyTopic"/> is set, alerts are only written to the log.
/// </summary>
public class AlertOptions
{
    public const string Section = "Alerts";

    /// <summary>The ntfy server; the public one by default, or a self-hosted one.</summary>
    public string NtfyServer { get; set; } = "https://ntfy.sh";

    /// <summary>
    /// The topic the phone subscribes to (a secret). On the public server anyone who knows a topic
    /// can read it, so use a long random one, or reserve it and set <see cref="NtfyToken"/>.
    /// </summary>
    public string NtfyTopic { get; set; } = "";

    /// <summary>An ntfy access token, for a reserved topic or a self-hosted server with auth. Optional.</summary>
    public string NtfyToken { get; set; } = "";

    public bool IsConfigured => NtfyTopic.Trim().Length > 0;
}

/// <summary>The site's public address, for links in alerts and emails (which have no request to read it from).</summary>
public class SiteOptions
{
    public const string Section = "Site";

    /// <summary>E.g. "https://jechel.dev", without a trailing slash.</summary>
    public string PublicUrl { get; set; } = "http://localhost:5173";

    public string UrlFor(string path) => PublicUrl.TrimEnd('/') + path;
}

/// <summary>Posts one alert to ntfy with the current settings.</summary>
public class NtfySender(IHttpClientFactory http, IOptionsMonitor<AlertOptions> options, IOptions<SiteOptions> site, ILogger<NtfySender> logger)
{
    public const string HttpClientName = "ntfy";

    /// <summary>False when no topic is set (the alert is only logged). Throws when ntfy refuses it or can't be reached.</summary>
    public async Task<bool> SendAsync(PhoneAlert alert, CancellationToken cancellationToken)
    {
        var config = options.CurrentValue;
        if (!config.IsConfigured)
        {
            logger.LogInformation("Phone alert (Alerts:NtfyTopic isn't set): {Title}: {Message}", alert.Title, alert.Message);
            return false;
        }

        // JSON publishing, so titles and messages can hold any characters (headers can't).
        var server = string.IsNullOrWhiteSpace(config.NtfyServer) ? "https://ntfy.sh" : config.NtfyServer.Trim();
        using var request = new HttpRequestMessage(HttpMethod.Post, server.TrimEnd('/') + "/")
        {
            Content = JsonContent.Create(NtfyMessage(alert, config.NtfyTopic.Trim(), site.Value)),
        };
        if (config.NtfyToken.Trim().Length > 0) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.NtfyToken.Trim());

        using var response = await http.CreateClient(HttpClientName).SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
        return true;
    }

    /// <summary>The body ntfy's JSON publishing expects.</summary>
    public static Dictionary<string, object> NtfyMessage(PhoneAlert alert, string topic, SiteOptions site)
    {
        var body = new Dictionary<string, object>
        {
            ["topic"] = topic,
            ["title"] = Cut(alert.Title, 200),
            ["message"] = Cut(alert.Message, 1000),
            ["priority"] = (int)alert.Priority,
        };
        if (alert.Tag.Length > 0) body["tags"] = new[] { alert.Tag };
        if (alert.Path is { Length: > 0 } path) body["click"] = site.UrlFor(path);
        if (alert.Actions is { Count: > 0 } actions)
        {
            // Buttons on the notification: the phone posts to the URL itself (no browser), then the notification goes away.
            body["actions"] = actions.Select(a => new Dictionary<string, object> { ["action"] = "http", ["label"] = a.Label, ["url"] = a.Url, ["method"] = "POST", ["clear"] = true }).ToArray();
        }
        return body;
    }

    private static string Cut(string text, int max) => text.Length <= max ? text : text[..(max - 1)] + "…";
}

/// <summary>Sends the queued <see cref="PhoneAlert"/>s, one at a time. A failed alert is logged and dropped.</summary>
public class AlertWorker(PhoneAlerts alerts, NtfySender ntfy, ILogger<AlertWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var alert in alerts.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                await ntfy.SendAsync(alert, stoppingToken);
            }
            catch (Exception e) when (!stoppingToken.IsCancellationRequested)
            {
                logger.LogWarning(e, "Couldn't send the phone alert \"{Title}\".", alert.Title);
            }
        }
    }
}
