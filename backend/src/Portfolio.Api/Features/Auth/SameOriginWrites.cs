using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Extensions.Options;

namespace Portfolio.Api.Features.Auth;

/// <summary>
/// A second guard against cross-site requests made with the admin's cookie (the first is its
/// SameSite=Lax): a request that changes something (POST, PUT, PATCH, DELETE) and carries the cookie
/// must come from the site itself, as its Origin header says. Browsers send Origin with every such
/// request; one without it isn't a browser's, so there's no cookie of a visitor's to misuse. Requests
/// without the cookie (visitors, webhooks) aren't checked.
/// </summary>
public static class SameOriginWrites
{
    public static IApplicationBuilder UseSameOriginWrites(this IApplicationBuilder app) => app.Use(async (context, next) =>
    {
        var request = context.Request;
        if (HttpMethods.IsGet(request.Method) || HttpMethods.IsHead(request.Method) || HttpMethods.IsOptions(request.Method) || HttpMethods.IsTrace(request.Method))
        {
            await next();
            return;
        }

        var cookie = context.RequestServices.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>()
            .Get(CookieAuthenticationDefaults.AuthenticationScheme).Cookie.Name!;
        var origin = request.Headers.Origin.ToString();
        if (!request.Cookies.ContainsKey(cookie) || origin.Length == 0 || IsSameOrigin(origin, request))
        {
            await next();
            return;
        }

        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsJsonAsync(
            new { title = "Cross-site request refused.", status = 403 },
            options: null,
            contentType: "application/problem+json");
    });

    /// <summary>Whether <paramref name="origin"/> ("https://jechel.dev") is the address the request came to (its scheme and host, as the proxy says).</summary>
    public static bool IsSameOrigin(string origin, HttpRequest request) =>
        Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
        string.Equals(uri.Scheme, request.Scheme, StringComparison.OrdinalIgnoreCase) &&
        string.Equals(uri.IsDefaultPort ? uri.Host : $"{uri.Host}:{uri.Port}", request.Host.Value, StringComparison.OrdinalIgnoreCase);
}
