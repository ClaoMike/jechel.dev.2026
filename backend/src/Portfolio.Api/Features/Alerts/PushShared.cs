using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Alerts;

/// <param name="Ready">Whether it can deliver now: ntfy has a topic (Settings → ntfy); the site's own notifications have a device that allowed them.</param>
public record AlertChannelDto(string Channel, bool Enabled, bool Ready);

/// <param name="Enabled">Required: a body without it is refused, never read as "off".</param>
public record SaveAlertChannelRequest(bool? Enabled);

/// <param name="LastSentAt">When a notification last reached its push service; null when none has.</param>
public record PushDeviceDto(int Id, string Label, string Endpoint, DateTimeOffset CreatedAt, DateTimeOffset? LastSentAt);

/// <param name="PublicKey">The site's key, which a browser needs to allow its notifications (applicationServerKey).</param>
public record PushSetupDto(string PublicKey, IReadOnlyList<PushDeviceDto> Devices);

/// <summary>As the browser's PushSubscription.toJSON() gives it, with what the device is.</summary>
public record PushKeysRequest(string? P256dh, string? Auth);
public record AddPushDeviceRequest(string? Endpoint, PushKeysRequest? Keys, string? Label);

/// <summary>
/// The Notifications tab's ways alerts go (ntfy, the site's own notifications), each switched on or off, and the devices
/// that allowed the site's own notifications. Admin only.
/// </summary>
public static class PushShared
{
    public const int LabelMaxLength = 100;

    internal static async Task<IReadOnlyList<PushDeviceDto>> DevicesAsync(PortfolioDbContext db, CancellationToken cancellationToken) =>
        await db.PushDevices.AsNoTracking()
            .OrderByDescending(d => d.CreatedAt)
            .ThenByDescending(d => d.Id)
            .Select(d => new PushDeviceDto(d.Id, d.Label, d.Endpoint, d.CreatedAt, d.LastSentAt))
            .ToListAsync(cancellationToken);

    /// <summary>
    /// An https address (push services all are; the API will post there), and both keys. Plain http only to this
    /// computer, in Development and the end-to-end tests (their stand-in push service).
    /// </summary>
    public static Dictionary<string, string[]> Validate(AddPushDeviceRequest request, IHostEnvironment environment)
    {
        var errors = new Dictionary<string, string[]>();
        var local = environment.IsDevelopment() || environment.IsEnvironment(Auth.AuthSetup.EndToEndEnvironment);
        if (!Uri.TryCreate(request.Endpoint?.Trim(), UriKind.Absolute, out var endpoint)
            || request.Endpoint!.Trim().Length > 1000
            || !(endpoint.Scheme == Uri.UriSchemeHttps || (local && endpoint.Scheme == Uri.UriSchemeHttp && endpoint.IsLoopback)))
        {
            errors["endpoint"] = ["The device's push address must be an https address."];
        }
        if (request.Keys?.P256dh is not { Length: > 0 and <= 200 } p256dh || string.IsNullOrWhiteSpace(p256dh)) errors["keys.p256dh"] = ["The device's key is missing."];
        if (request.Keys?.Auth is not { Length: > 0 and <= 100 } auth || string.IsNullOrWhiteSpace(auth)) errors["keys.auth"] = ["The device's secret is missing."];
        return errors;
    }

    /// <summary>Where alerts go (ntfy, this site's notifications): whether each is on, and set up.</summary>
    internal static async Task<IReadOnlyList<AlertChannelDto>> LoadChannelsAsync(PortfolioDbContext db, IOptionsMonitor<AlertOptions> ntfy, CancellationToken cancellationToken)
    {
        var off = (await db.AlertChannels.AsNoTracking().Where(c => !c.Enabled).Select(c => c.Channel).ToListAsync(cancellationToken)).ToHashSet();
        var devices = await db.PushDevices.AnyAsync(cancellationToken);
        return [.. AlertChannels.All.Select(c => new AlertChannelDto(c, !off.Contains(c), c == AlertChannels.Ntfy ? ntfy.CurrentValue.IsConfigured : devices))];
    }
}
