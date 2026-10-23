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
    /// The session cookie. "__Host-" (production) makes browsers keep it only if it's Secure, for the
    /// whole site and for exactly this host: a subdomain can't set or overwrite it. Plain over http://localhost.
    /// </summary>
    public const string CookieName = "__Host-portfolio.auth";
    public const string DevelopmentCookieName = "portfolio.auth";

    /// <summary>
    /// The end-to-end tests' environment (e2e/): like Development (plain cookies over http://localhost), but without
    /// the developer's user secrets, so nothing real is sent (emails, YouTube), and signed in through a stand-in for Google.
    /// </summary>
    public const string EndToEndEnvironment = "E2E";

    /// <summary>
    /// Cookie sessions backed by <see cref="AdminSessionService"/> (one per device: token hash + expiry in
    /// the database) + Google as the external login provider (<see cref="GoogleSignIn"/>).
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

        // http://localhost in development (and the end-to-end tests); always Secure everywhere else.
        var local = builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment(EndToEndEnvironment);
        var cookieSecurePolicy = local
            ? CookieSecurePolicy.SameAsRequest
            : CookieSecurePolicy.Always;

        var authentication = builder.Services
            .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie(options =>
            {
                options.Cookie.Name = local ? DevelopmentCookieName : CookieName;
                options.Cookie.Path = "/";
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

                    var sessions = services.GetRequiredService<AdminSessionService>();
                    var status = SessionStatus.Invalid;
                    if (admins.CurrentValue.IsAdmin(principal.FindFirstValue(ClaimTypes.Email), principal.FindFirstValue(ClaimTypes.NameIdentifier)))
                    {
                        status = await sessions.ValidateAsync(principal, context.HttpContext.RequestAborted);
                    }
                    else
                    {
                        // Taken off the list: its session ends for good, not just for now.
                        await sessions.EndAsync(principal, context.HttpContext.RequestAborted);
                    }

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
                GoogleSignIn.MapClaims(options);

                // The end-to-end tests sign in through a stand-in for Google (E2E:Services, e2e/fakeServices.ts).
                // Only in that environment: everywhere else this is ignored and it's always Google.
                if (builder.Environment.IsEnvironment(EndToEndEnvironment) && builder.Configuration["E2E:Services"] is { Length: > 0 } fakes)
                {
                    var fake = fakes.TrimEnd('/');
                    options.AuthorizationEndpoint = $"{fake}/google/auth";
                    options.TokenEndpoint = $"{fake}/google/token";
                    options.UserInformationEndpoint = $"{fake}/google/userinfo";
                }

                // Google redirects back with a top-level GET, so Lax is enough and also works on http://localhost.
                options.CorrelationCookie.SameSite = SameSiteMode.Lax;
                options.CorrelationCookie.SecurePolicy = cookieSecurePolicy;

                options.Events.OnTicketReceived = GoogleSignIn.OnTicketReceivedAsync;
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
