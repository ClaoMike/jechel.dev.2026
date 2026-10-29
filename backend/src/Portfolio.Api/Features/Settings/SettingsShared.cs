using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Auth;

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
public static class SettingsShared
{
    /// <summary>What went wrong, in a line: the service's own answer when there is one.</summary>
    internal static string Explain(Exception e) => e switch
    {
        ServiceException service => service.Message,
        HttpRequestException { StatusCode: { } status } => $"The service answered {(int)status} {status}.",
        HttpRequestException => "The service couldn't be reached.",
        TaskCanceledException => "The service took too long to answer.",
        _ => e.Message,
    };

    /// <summary>The connection settings as the Settings tab shows them (secrets only as set or not, and their last 4 characters).</summary>
    internal static async Task<SettingsResponse> LoadSettingsAsync(
        PortfolioDbContext db,
        SettingsStore store,
        IConfiguration configuration,
        IOptionsMonitor<AdminOptions> admins,
        IOptions<SiteOptions> site,
        CancellationToken cancellationToken)
    {
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

        return new SettingsResponse(list, google, site.Value.PublicUrl.TrimEnd('/'));
    }
}

/// <summary>A service refused a request; the message is its own explanation, safe to show the admin.</summary>
public class ServiceException(string message) : Exception(message);
