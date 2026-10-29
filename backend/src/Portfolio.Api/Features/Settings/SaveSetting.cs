using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Auth;
using Portfolio.Api.Features.YouTube;
using static Portfolio.Api.Features.Settings.SettingsShared;

namespace Portfolio.Api.Features.Settings;

/// <summary>Saves (encrypting secrets) or, with an empty value, clears one setting. It applies at once.</summary>
public sealed class SaveSetting : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/settings").RequireAuthorization().MapPut("/{key}", Handle).WithName("SaveSetting");

    public static async Task<Results<Ok<SettingsResponse>, NotFound, ValidationProblem>> Handle(
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

        http.Response.Headers.CacheControl = "private, no-store";
        return TypedResults.Ok(await LoadSettingsAsync(db, store, configuration, admins, site, cancellationToken));
    }
}
