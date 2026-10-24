using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using Lib.Net.Http.WebPush;
using Lib.Net.Http.WebPush.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Alerts;

/// <summary>How a push went: delivered to at least one device, none allowed yet, or every device failed.</summary>
public enum PushResult
{
    Sent,
    NoDevices,
    Failed,
}

/// <summary>
/// The site's own notifications (Web Push): each alert, encrypted for every device that allowed them (Notifications tab),
/// posted to that device's push service and signed with the site's key pair, which is made the first time it's needed
/// and kept (<see cref="WebPushKeys"/>). A device its push service no longer knows (404, 410: removed from the Home
/// Screen, notifications turned off) is forgotten. The page's service worker (public/sw.js) shows it, and opens its page
/// when tapped. Unlike ntfy, there are no buttons on it (iPhones don't show them) and no priorities.
/// </summary>
public class WebPushSender(IHttpClientFactory http, IServiceScopeFactory scopes, IOptions<SiteOptions> site, TimeProvider time, ILogger<WebPushSender> logger)
{
    public const string HttpClientName = "web-push";

    /// <summary>How long a push service keeps a notification for a device that's off or out of reach.</summary>
    public static readonly TimeSpan KeptFor = TimeSpan.FromDays(1);

    private readonly SemaphoreSlim _keysLock = new(1, 1);
    private WebPushKeys? _keys;

    /// <summary>The site's key pair, made and kept the first time.</summary>
    public async Task<WebPushKeys> KeysAsync(CancellationToken cancellationToken)
    {
        if (_keys is { } kept) return kept;
        await _keysLock.WaitAsync(cancellationToken);
        try
        {
            if (_keys is { } loaded) return loaded;
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<PortfolioDbContext>();
            var keys = await db.WebPushKeys.AsNoTracking().FirstOrDefaultAsync(k => k.Id == WebPushKeys.SingletonId, cancellationToken);
            if (keys is null)
            {
                keys = NewKeys(time.GetUtcNow());
                db.WebPushKeys.Add(keys);
                await db.SaveChangesAsync(cancellationToken);
            }
            return _keys = keys;
        }
        finally
        {
            _keysLock.Release();
        }
    }

    /// <summary>A fresh P-256 key pair, as push services and browsers take it: the public key a raw point, the private its scalar, both base64url.</summary>
    public static WebPushKeys NewKeys(DateTimeOffset now)
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var parameters = key.ExportParameters(includePrivateParameters: true);
        byte[] point = [0x04, .. parameters.Q.X!, .. parameters.Q.Y!];
        return new WebPushKeys { Id = WebPushKeys.SingletonId, PublicKey = Base64Url(point), PrivateKey = Base64Url(parameters.D!), CreatedAt = now };
    }

    /// <summary>To every device that allowed notifications.</summary>
    public async Task<PushResult> SendAsync(PhoneAlert alert, CancellationToken cancellationToken)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PortfolioDbContext>();
        var devices = await db.PushDevices.ToListAsync(cancellationToken);
        if (devices.Count == 0)
        {
            logger.LogInformation("Notification (no device has allowed them): {Title}: {Message}", alert.Title, alert.Message);
            return PushResult.NoDevices;
        }

        var sent = 0;
        foreach (var device in devices)
        {
            if (await SendToAsync(db, device, alert, cancellationToken)) sent++;
        }
        await db.SaveChangesAsync(cancellationToken);
        return sent > 0 ? PushResult.Sent : PushResult.Failed;
    }

    /// <summary>To one device (its test button). False when it failed; a device its push service no longer knows is forgotten.</summary>
    public async Task<bool> SendToAsync(PortfolioDbContext db, PushDevice device, PhoneAlert alert, CancellationToken cancellationToken)
    {
        var keys = await KeysAsync(cancellationToken);
        var client = new PushServiceClient(http.CreateClient(HttpClientName))
        {
            DefaultAuthentication = new VapidAuthentication(keys.PublicKey, keys.PrivateKey) { Subject = Subject(site.Value) },
            DefaultAuthenticationScheme = VapidAuthenticationScheme.Vapid,
            AutoRetryAfter = false,
        };
        var subscription = new PushSubscription { Endpoint = device.Endpoint };
        subscription.SetKey(PushEncryptionKeyName.P256DH, device.P256dh);
        subscription.SetKey(PushEncryptionKeyName.Auth, device.Auth);
        var message = new PushMessage(Payload(alert, site.Value))
        {
            TimeToLive = (int)KeptFor.TotalSeconds,
            Urgency = alert.Priority >= AlertPriority.High ? PushMessageUrgency.High : PushMessageUrgency.Normal,
        };

        try
        {
            await client.RequestPushMessageDeliveryAsync(subscription, message, cancellationToken);
            device.LastSentAt = time.GetUtcNow();
            return true;
        }
        catch (PushServiceClientException e) when (e.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone)
        {
            logger.LogInformation("Forgetting the notification device \"{Label}\": its push service no longer knows it ({Status}).", device.Label, (int)e.StatusCode);
            db.PushDevices.Remove(device);
            return false;
        }
        catch (Exception e) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(e, "Couldn't send the notification \"{Title}\" to \"{Label}\".", alert.Title, device.Label);
            return false;
        }
    }

    /// <summary>What the service worker reads (public/sw.js): the title, the text, the site's page to open, and a tag so one of a kind replaces the last.</summary>
    public static string Payload(PhoneAlert alert, SiteOptions site) =>
        JsonSerializer.Serialize(
            new
            {
                title = NtfySender.Cut(alert.Title, 200),
                body = NtfySender.Cut(alert.Message, 1000),
                url = alert.Path is { Length: > 0 } path ? site.UrlFor(path) : site.UrlFor("/"),
            },
            JsonSerializerOptions.Web);

    /// <summary>Who's sending, for push services to reach if something's wrong: the site's address (https only; "mailto:" stands in elsewhere).</summary>
    public static string Subject(SiteOptions site) => site.PublicUrl.StartsWith("https://", StringComparison.Ordinal) ? site.PublicUrl.TrimEnd('/') : "mailto:alerts@jechel.dev";

    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
