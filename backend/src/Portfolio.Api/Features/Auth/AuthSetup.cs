using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace Portfolio.Api.Features.Auth;

public static class AuthSetup
{
    public const string CallbackPath = "/api/auth/signin-google";
    public const string AdminLoginPage = "/admin";

    /// <summary>
    /// Cookie session backed by <see cref="AdminSessionService"/> (token hash + expiry in the
    /// database) + Google as the external login provider.
    /// Google is only registered when a ClientId/ClientSecret are configured, so the API
    /// (and its tests) still run without Google credentials.
    /// </summary>
    public static WebApplicationBuilder AddPortfolioAuth(this WebApplicationBuilder builder)
    {
        builder.Services.Configure<AdminOptions>(builder.Configuration.GetSection(AdminOptions.SectionName));
        builder.Services.TryAddSingleton(TimeProvider.System);
        builder.Services.AddScoped<AdminSessionService>();

        // The cookie lives exactly as long as the idle timeout; it's re-issued whenever the
        // database session is extended (see OnValidatePrincipal), so both expire together.
        builder.Services
            .AddOptions<CookieAuthenticationOptions>(CookieAuthenticationDefaults.AuthenticationScheme)
            .Configure<IOptions<AdminOptions>>((cookie, admin) => cookie.ExpireTimeSpan = admin.Value.SessionIdleTimeout);

        // http://localhost in development; always Secure everywhere else.
        var cookieSecurePolicy = builder.Environment.IsDevelopment()
            ? CookieSecurePolicy.SameAsRequest
            : CookieSecurePolicy.Always;

        var authentication = builder.Services
            .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie(options =>
            {
                options.Cookie.Name = "portfolio.auth";
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Lax;
                options.Cookie.SecurePolicy = cookieSecurePolicy;
                options.SlidingExpiration = false;

                options.Events.OnRedirectToLogin = context =>
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    return Task.CompletedTask;
                };
                options.Events.OnRedirectToAccessDenied = context =>
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    return Task.CompletedTask;
                };
                // Runs on every request that carries the cookie: that request is the "activity"
                // which keeps the session alive.
                options.Events.OnValidatePrincipal = async context =>
                {
                    var services = context.HttpContext.RequestServices;
                    var admins = services.GetRequiredService<IOptionsMonitor<AdminOptions>>();
                    var principal = context.Principal!;

                    var status = admins.CurrentValue.IsAdmin(principal.FindFirstValue(ClaimTypes.Email))
                        ? await services.GetRequiredService<AdminSessionService>()
                            .ValidateAsync(principal, context.HttpContext.RequestAborted)
                        : SessionStatus.Invalid;

                    if (status == SessionStatus.Invalid)
                    {
                        context.RejectPrincipal();
                        await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
                    }
                    else if (status == SessionStatus.Extended)
                    {
                        context.ShouldRenew = true;
                    }
                };
            });

        var google = builder.Configuration.GetSection("Authentication:Google");
        if (!string.IsNullOrWhiteSpace(google["ClientId"]) && !string.IsNullOrWhiteSpace(google["ClientSecret"]))
        {
            authentication.AddGoogle(options =>
            {
                options.ClientId = google["ClientId"]!;
                options.ClientSecret = google["ClientSecret"]!;
                options.CallbackPath = CallbackPath;
                options.SignInScheme = CookieAuthenticationDefaults.AuthenticationScheme;
                options.ClaimActions.MapJsonKey("picture", "picture");

                // Google redirects back with a top-level GET, so Lax is enough and also works on http://localhost.
                options.CorrelationCookie.SameSite = SameSiteMode.Lax;
                options.CorrelationCookie.SecurePolicy = cookieSecurePolicy;

                options.Events.OnTicketReceived = async context =>
                {
                    var services = context.HttpContext.RequestServices;
                    var admins = services.GetRequiredService<IOptionsMonitor<AdminOptions>>();
                    if (!admins.CurrentValue.IsAdmin(context.Principal?.FindFirstValue(ClaimTypes.Email)))
                    {
                        context.Response.Redirect($"{AdminLoginPage}?error=not_authorized");
                        context.HandleResponse();
                        return;
                    }

                    // New session in the database; this signs out every other browser/device.
                    var sessions = services.GetRequiredService<AdminSessionService>();
                    if (!await sessions.StartAsync(context.Principal!, context.HttpContext.RequestAborted))
                    {
                        context.Response.Redirect($"{AdminLoginPage}?error=login_failed");
                        context.HandleResponse();
                        return;
                    }

                    context.Properties!.IsPersistent = true;
                };
                options.Events.OnRemoteFailure = context =>
                {
                    // e.g. the user cancelled on Google's consent screen
                    context.Response.Redirect($"{AdminLoginPage}?error=login_failed");
                    context.HandleResponse();
                    return Task.CompletedTask;
                };
            });
        }

        builder.Services.AddAuthorization();

        return builder;
    }
}
