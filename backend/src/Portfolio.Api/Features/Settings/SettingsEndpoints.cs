using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Auth;
using Portfolio.Api.Features.Updates;
using Portfolio.Api.Features.YouTube;

namespace Portfolio.Api.Features.Settings;

/// <param name="Value">Only for settings that aren't secret.</param>
/// <param name="Hint">For a secret that's set: its last 4 characters, to recognise it.</param>
/// <param name="Source">"settings" (saved in the Settings tab), "configuration" (appsettings, user secrets, environment) or "none".</param>
public record SettingDto(string Key, string Label, bool IsSecret, string? Value, bool IsSet, string? Hint, string Source, DateTimeOffset? UpdatedAt);

/// <summary>Google sign-in can't be changed here (a wrong secret would lock the admin out); the tab shows how it's set up.</summary>
public record GoogleStatus(bool IsConfigured, string? ClientIdHint, int AdminEmailCount, string RedirectUri);

/// <param name="SiteUrl">The site's public address (Site:PublicUrl), for the webhook and callback links to paste into the services.</param>
public record SettingsResponse(IReadOnlyList<SettingDto> Settings, GoogleStatus Google, string SiteUrl);

/// <param name="Value">Empty clears it, so the configuration's value (if any) applies again.</param>
public record SaveSettingRequest(string? Value);

public record TestResult(bool Ok, string Message);

/// <summary>The admin's Settings tab: the keys and links of the services the site connects to.</summary>
public static class SettingsEndpoints
{
    public static IEndpointRouteBuilder MapSettingsEndpoints(this IEndpointRouteBuilder app)
    {
        var settings = app.MapGroup("/settings").RequireAuthorization();

        settings.MapGet("/", GetSettings).WithName("GetSettings");
        settings.MapPut("/{key}", SaveSetting).WithName("SaveSetting");
        settings.MapPost("/test/{service}", TestService).WithName("TestService");

        return app;
    }

    public static async Task<Ok<SettingsResponse>> GetSettings(
        PortfolioDbContext db,
        SettingsStore store,
        IConfiguration configuration,
        IOptionsMonitor<AdminOptions> admins,
        IOptions<SiteOptions> site,
        HttpContext http,
        CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "private, no-store";
        var updated = (await db.SiteSettings.AsNoTracking().Select(s => new { s.Key, s.UpdatedAt }).ToListAsync(cancellationToken))
            .ToDictionary(s => s.Key, s => s.UpdatedAt, StringComparer.OrdinalIgnoreCase);

        var list = SettingsCatalog.All.Select(definition =>
        {
            var saved = store.Get(definition.Key);
            var configured = configuration[definition.Key];
            var value = saved is { Length: > 0 } ? saved : configured ?? "";
            var source = saved is { Length: > 0 } ? "settings" : configured is { Length: > 0 } ? "configuration" : "none";
            return new SettingDto(
                definition.Key,
                definition.Label,
                definition.IsSecret,
                definition.IsSecret ? null : value,
                value.Length > 0,
                definition.IsSecret && value.Length >= 12 ? value[^4..] : null,
                source,
                updated.TryGetValue(definition.Key, out var at) ? at : null);
        }).ToList();

        var clientId = configuration["Authentication:Google:ClientId"] ?? "";
        var google = new GoogleStatus(
            clientId.Length > 0 && (configuration["Authentication:Google:ClientSecret"] ?? "").Length > 0,
            clientId.Length >= 12 ? clientId[..8] + "…" : null,
            admins.CurrentValue.AdminEmails.Length,
            site.Value.UrlFor("/api/auth/signin-google"));

        return TypedResults.Ok(new SettingsResponse(list, google, site.Value.PublicUrl.TrimEnd('/')));
    }

    /// <summary>Saves (encrypting secrets) or, with an empty value, clears one setting. It applies at once.</summary>
    public static async Task<Results<Ok<SettingsResponse>, NotFound, ValidationProblem>> SaveSetting(
        string key,
        SaveSettingRequest request,
        PortfolioDbContext db,
        SettingsStore store,
        YouTubeVideoStore videos,
        IConfiguration configuration,
        IOptionsMonitor<AdminOptions> admins,
        IOptions<SiteOptions> site,
        TimeProvider time,
        HttpContext http,
        CancellationToken cancellationToken)
    {
        var definition = SettingsCatalog.Find(key);
        if (definition is null) return TypedResults.NotFound();

        var value = request.Value?.Trim() ?? "";
        if (SettingsCatalog.Validate(definition, value) is { } error)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["value"] = [error] });
        }

        var row = await db.SiteSettings.FindAsync([definition.Key], cancellationToken);
        if (value.Length == 0)
        {
            if (row is not null) db.SiteSettings.Remove(row);
        }
        else
        {
            if (row is null)
            {
                row = new SiteSetting { Key = definition.Key, Value = "" };
                db.SiteSettings.Add(row);
            }
            row.Value = definition.IsSecret ? store.Protect(value) : value;
            row.IsEncrypted = definition.IsSecret;
            row.UpdatedAt = time.GetUtcNow();
        }
        await db.SaveChangesAsync(cancellationToken);
        await store.ReloadAsync(db, cancellationToken);

        // Another channel or key: show its videos, not the ones kept from before.
        if (definition.Key.StartsWith("YouTube:", StringComparison.Ordinal)) videos.Clear();

        return TypedResults.Ok((await GetSettings(db, store, configuration, admins, site, http, cancellationToken)).Value!);
    }

    /// <summary>Tries a service with the current settings: "ntfy" sends a test alert, "email" a test email to the admin, "youtube" lists the videos, "cal" checks the Cal.com API key.</summary>
    public static async Task<Results<Ok<TestResult>, NotFound>> TestService(
        string service,
        NtfySender ntfy,
        IEmailSender emails,
        IYouTubeClient youTube,
        IOptionsMonitor<YouTubeOptions> youTubeOptions,
        Meetings.ICalClient cal,
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        try
        {
            switch (service)
            {
                case "ntfy":
                    if (!await ntfy.SendAsync(new PhoneAlert("It works!", "Alerts from jechel.dev will arrive here.", "/settings", AlertPriority.Default, "tada"), cancellationToken))
                        return TypedResults.Ok(new TestResult(false, "Set the topic first."));
                    return TypedResults.Ok(new TestResult(true, "Sent. It should be on your phone now."));

                case "email":
                    var to = user.FindFirstValue(ClaimTypes.Email) ?? "";
                    if (emails is SwitchingEmailSender { IsConfigured: false })
                        return TypedResults.Ok(new TestResult(false, "Set the Resend API key first."));
                    await emails.SendAsync(new EmailMessage(to, "jechel.dev: test email", "<p>Emails from jechel.dev work.</p>", "Emails from jechel.dev work."), cancellationToken);
                    return TypedResults.Ok(new TestResult(true, $"Sent to {to}."));

                case "youtube":
                    if (!youTubeOptions.CurrentValue.IsConfigured)
                        return TypedResults.Ok(new TestResult(false, "Set the channel and the API key first."));
                    var videos = await youTube.FetchVideosAsync(cancellationToken);
                    return TypedResults.Ok(new TestResult(true, $"Found {videos.Count} public {(videos.Count == 1 ? "video" : "videos")}."));

                case "cal":
                    return TypedResults.Ok(new TestResult(true, $"The API key works, for {await cal.WhoAmIAsync(cancellationToken)}."));

                default:
                    return TypedResults.NotFound();
            }
        }
        catch (Exception e) when (!cancellationToken.IsCancellationRequested)
        {
            return TypedResults.Ok(new TestResult(false, Explain(e)));
        }
    }

    /// <summary>What went wrong, in a line: the service's own answer when there is one.</summary>
    private static string Explain(Exception e) => e switch
    {
        ServiceException service => service.Message,
        HttpRequestException { StatusCode: { } status } => $"The service answered {(int)status} {status}.",
        HttpRequestException => "The service couldn't be reached.",
        TaskCanceledException => "The service took too long to answer.",
        _ => e.Message,
    };
}

/// <summary>A service refused a request; the message is its own explanation, safe to show the admin.</summary>
public class ServiceException(string message) : Exception(message);
