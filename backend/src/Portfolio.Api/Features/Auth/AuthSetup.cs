using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.Extensions.Options;

namespace Portfolio.Api.Features.Auth;

public static class AuthSetup
{
    public const string CallbackPath = "/api/auth/signin-google";
    public const string AdminLoginPage = "/admin";

    /// <summary>
    /// Cookie session (the API's own auth) + Google as the external login provider.
    /// Google is only registered when a ClientId/ClientSecret are configured, so the API
    /// (and its tests) still run without Google credentials.
    /// </summary>
    public static WebApplicationBuilder AddPortfolioAuth(this WebApplicationBuilder builder)
    {
        builder.Services.Configure<AdminOptions>(builder.Configuration.GetSection(AdminOptions.SectionName));

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
                options.ExpireTimeSpan = TimeSpan.FromDays(7);
                options.SlidingExpiration = true;

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
                options.Events.OnValidatePrincipal = async context =>
                {
                    var admins = context.HttpContext.RequestServices.GetRequiredService<IOptionsMonitor<AdminOptions>>();
                    if (!admins.CurrentValue.IsAdmin(context.Principal?.FindFirstValue(ClaimTypes.Email)))
                    {
                        context.RejectPrincipal();
                        await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
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

                options.Events.OnTicketReceived = context =>
                {
                    var admins = context.HttpContext.RequestServices.GetRequiredService<IOptionsMonitor<AdminOptions>>();
                    if (!admins.CurrentValue.IsAdmin(context.Principal?.FindFirstValue(ClaimTypes.Email)))
                    {
                        context.Response.Redirect($"{AdminLoginPage}?error=not_authorized");
                        context.HandleResponse();
                    }
                    return Task.CompletedTask;
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
