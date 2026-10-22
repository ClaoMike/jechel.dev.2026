using System.Net;
using System.Security.Cryptography;
using System.Text;

namespace Portfolio.Api;

/// <summary>
/// In production the site's own address forwards /api to this API (a Cloudflare Pages Function, see
/// frontend/functions/api), so the browser only ever talks to one origin. The proxy proves itself with
/// a shared secret (Proxy:Secret) and says what the browser saw: the host, the visitor's IP and country.
/// With a secret set, any request without it is answered 404, so the API's own address shows nothing.
/// Without one (locally, in tests) nothing changes.
/// </summary>
public static class ProxyHeaders
{
    public const string SecretHeader = "X-Proxy-Secret";
    public const string HostHeader = "X-Site-Host";
    public const string ClientIpHeader = "X-Client-IP";
    public const string ClientCountryHeader = "X-Client-Country";

    /// <summary>The hosting platform checks this one directly, not through the proxy.</summary>
    public const string HealthPath = "/api/health";

    public static IApplicationBuilder UseProxyHeaders(this IApplicationBuilder app, string? secret)
    {
        if (string.IsNullOrEmpty(secret)) return app;
        var expected = Encoding.UTF8.GetBytes(secret);

        return app.Use(async (context, next) =>
        {
            var request = context.Request;
            if (request.Path.Equals(HealthPath, StringComparison.OrdinalIgnoreCase))
            {
                await next();
                return;
            }

            var given = Encoding.UTF8.GetBytes(request.Headers[SecretHeader].ToString());
            if (!CryptographicOperations.FixedTimeEquals(given, expected))
            {
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                return;
            }

            // What the browser saw: https on the site's own host, from the visitor's address.
            request.Scheme = "https";
            if (request.Headers[HostHeader].ToString() is { Length: > 0 } host) request.Host = new HostString(host);
            if (IPAddress.TryParse(request.Headers[ClientIpHeader].ToString(), out var ip)) context.Connection.RemoteIpAddress = ip;
            // As Cloudflare names it, where the rest of the API reads it (analytics, sign-in alerts).
            request.Headers["CF-IPCountry"] = request.Headers[ClientCountryHeader];
            await next();
        });
    }
}
