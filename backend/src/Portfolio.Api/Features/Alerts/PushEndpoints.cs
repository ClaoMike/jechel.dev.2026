using Microsoft.AspNetCore.Http.HttpResults;
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
public static class PushEndpoints
{
    public const int LabelMaxLength = 100;

    public static IEndpointRouteBuilder MapPushEndpoints(this IEndpointRouteBuilder app)
    {
        var notifications = app.MapGroup("/notifications").RequireAuthorization();

        notifications.MapGet("/channels", ListChannels).WithName("ListAlertChannels");
        notifications.MapPut("/channels/{channel}", SaveChannel).WithName("SaveAlertChannel");
        notifications.MapGet("/push", GetPush).WithName("GetPushSetup");
        notifications.MapPost("/push/devices", AddDevice).WithName("AddPushDevice");
        notifications.MapDelete("/push/devices/{id:int}", RemoveDevice).WithName("RemovePushDevice");
        notifications.MapPost("/push/devices/{id:int}/test", TestDevice).WithName("TestPushDevice");

        return app;
    }

    public static async Task<Ok<IReadOnlyList<AlertChannelDto>>> ListChannels(PortfolioDbContext db, IOptionsMonitor<AlertOptions> ntfy, CancellationToken cancellationToken)
    {
        var off = (await db.AlertChannels.AsNoTracking().Where(c => !c.Enabled).Select(c => c.Channel).ToListAsync(cancellationToken)).ToHashSet();
        var devices = await db.PushDevices.AnyAsync(cancellationToken);
        IReadOnlyList<AlertChannelDto> channels = [.. AlertChannels.All.Select(c => new AlertChannelDto(c, !off.Contains(c), c == AlertChannels.Ntfy ? ntfy.CurrentValue.IsConfigured : devices))];
        return TypedResults.Ok(channels);
    }

    /// <summary>Switches one way on or off; it applies to the next alert. Every way, as it now is.</summary>
    public static async Task<Results<Ok<IReadOnlyList<AlertChannelDto>>, NotFound, ValidationProblem>> SaveChannel(
        string channel,
        SaveAlertChannelRequest request,
        PortfolioDbContext db,
        AlertPreferences preferences,
        IOptionsMonitor<AlertOptions> ntfy,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        if (!AlertChannels.All.Contains(channel)) return TypedResults.NotFound();
        if (request?.Enabled is not { } enabled) return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["enabled"] = ["Say whether it's on: true or false."] });

        var row = await db.AlertChannels.FindAsync([channel], cancellationToken);
        if (row is null)
        {
            row = new AlertChannelSetting { Channel = channel };
            db.AlertChannels.Add(row);
        }
        row.Enabled = enabled;
        row.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);
        await preferences.ReloadAsync(db, cancellationToken);

        return TypedResults.Ok((await ListChannels(db, ntfy, cancellationToken)).Value!);
    }

    /// <summary>The site's key (made the first time) and the devices that allowed notifications, the newest first.</summary>
    public static async Task<Ok<PushSetupDto>> GetPush(PortfolioDbContext db, WebPushSender push, CancellationToken cancellationToken)
    {
        var keys = await push.KeysAsync(cancellationToken);
        return TypedResults.Ok(new PushSetupDto(keys.PublicKey, await DevicesAsync(db, cancellationToken)));
    }

    /// <summary>
    /// A device allowed notifications: kept, or updated when it's known already (a browser allowing them again keeps its
    /// address, maybe with new keys). Every device, as they now are.
    /// </summary>
    public static async Task<Results<Ok<IReadOnlyList<PushDeviceDto>>, ValidationProblem>> AddDevice(
        AddPushDeviceRequest request,
        PortfolioDbContext db,
        IHostEnvironment environment,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var errors = Validate(request, environment);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var endpoint = request.Endpoint!.Trim();
        var device = await db.PushDevices.FirstOrDefaultAsync(d => d.Endpoint == endpoint, cancellationToken);
        if (device is null)
        {
            device = new PushDevice { Endpoint = endpoint, P256dh = "", Auth = "", Label = "", CreatedAt = time.GetUtcNow() };
            db.PushDevices.Add(device);
        }
        device.P256dh = request.Keys!.P256dh!.Trim();
        device.Auth = request.Keys.Auth!.Trim();
        device.Label = NtfySender.Cut(string.IsNullOrWhiteSpace(request.Label) ? "A browser" : request.Label.Trim(), LabelMaxLength);
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.Ok(await DevicesAsync(db, cancellationToken));
    }

    public static async Task<Results<Ok<IReadOnlyList<PushDeviceDto>>, NotFound>> RemoveDevice(int id, PortfolioDbContext db, CancellationToken cancellationToken)
    {
        var device = await db.PushDevices.FindAsync([id], cancellationToken);
        if (device is null) return TypedResults.NotFound();
        db.PushDevices.Remove(device);
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(await DevicesAsync(db, cancellationToken));
    }

    /// <summary>A test notification to that device alone, whatever the switches say. 502 when its push service refused it (a device it no longer knows is forgotten).</summary>
    public static async Task<Results<NoContent, NotFound, ProblemHttpResult>> TestDevice(int id, PortfolioDbContext db, WebPushSender push, CancellationToken cancellationToken)
    {
        var device = await db.PushDevices.FindAsync([id], cancellationToken);
        if (device is null) return TypedResults.NotFound();
        var test = new PhoneAlert(AlertKinds.Test, "It works!", "Alerts from jechel.dev will arrive here.", "/notifications");
        var sent = await push.SendToAsync(db, device, test, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return sent ? TypedResults.NoContent() : TypedResults.Problem("The notification couldn't be sent to that device.", statusCode: StatusCodes.Status502BadGateway);
    }

    private static async Task<IReadOnlyList<PushDeviceDto>> DevicesAsync(PortfolioDbContext db, CancellationToken cancellationToken) =>
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
}
