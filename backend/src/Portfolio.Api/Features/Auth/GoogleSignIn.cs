using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OAuth;
using Microsoft.Extensions.Options;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Analytics;

namespace Portfolio.Api.Features.Auth;

/// <summary>
/// What happens when Google sends someone back (the end of the sign-in flow): only an allowed account
/// with a verified email gets a session on this device. Every sign-in, and every refused one, rings
/// the admin's phone, so one they didn't make stands out.
/// </summary>
public static class GoogleSignIn
{
    public const string EmailVerifiedClaimType = "email_verified";
    public const string PictureClaimType = "picture";

    /// <summary>Google's user info says whether the email is verified as a JSON true/false: kept as "true" or "false".</summary>
    public static void MapClaims(OAuthOptions options)
    {
        options.ClaimActions.MapJsonKey(PictureClaimType, "picture");
        options.ClaimActions.MapCustomJson(EmailVerifiedClaimType, user =>
            user.TryGetProperty("email_verified", out var verified) && verified.ValueKind == JsonValueKind.True ? "true" : "false");
    }

    public static async Task OnTicketReceivedAsync(TicketReceivedContext context)
    {
        var http = context.HttpContext;
        var services = http.RequestServices;
        var alerts = services.GetRequiredService<IPhoneAlerts>();
        var principal = context.Principal!;
        var email = principal.FindFirstValue(ClaimTypes.Email);
        var device = DeviceOf(http);

        if (principal.FindFirstValue(EmailVerifiedClaimType) != "true" ||
            !services.GetRequiredService<IOptionsMonitor<AdminOptions>>().CurrentValue.IsAdmin(email, principal.FindFirstValue(ClaimTypes.NameIdentifier)))
        {
            alerts.SendThrottled(
                $"auth:refused:{email}",
                new PhoneAlert("Sign-in refused", $"{email ?? "An account without an email"} tried to sign in to jechel.dev\n{device}", "/settings", AlertPriority.Default, "no_entry"));
            context.Response.Redirect($"{AuthSetup.AdminLoginPage}?error=not_authorized");
            context.HandleResponse();
            return;
        }

        var sessions = services.GetRequiredService<AdminSessionService>();
        // Signing in again in a browser that's still signed in replaces its session (one entry per device).
        var previous = await http.AuthenticateAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        if (previous.Principal is { } signedIn) await sessions.EndAsync(signedIn, http.RequestAborted);
        await sessions.StartAsync(principal, http, http.RequestAborted);
        context.Properties!.IsPersistent = true;
        alerts.Send(new PhoneAlert("Signed in to jechel.dev", $"{device}\nNot you? Sign that device out in Settings.", "/settings", AlertPriority.High, "key"));
    }

    /// <summary>"Chrome on macOS · 203.0.113.7 (GB)": what the alerts say about where a sign-in came from.</summary>
    public static string DeviceOf(HttpContext http)
    {
        var agent = AnalyticsRules.ParseUserAgent(http.Request.Headers.UserAgent);
        var ip = http.Connection.RemoteIpAddress?.ToString() ?? "an unknown address";
        var country = AnalyticsRules.NormalizeCountry(http.Request.Headers["CF-IPCountry"]);
        return $"{AdminSessionService.Describe(agent)} · {ip}{(country is null ? "" : $" ({country})")}";
    }
}
