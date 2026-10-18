using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api;
using Portfolio.Api.Data;
using Portfolio.Api.Features.About;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Analytics;
using Portfolio.Api.Features.Apps;
using Portfolio.Api.Features.Auth;
using Portfolio.Api.Features.Contact;
using Portfolio.Api.Features.Files;
using Portfolio.Api.Features.LeetCode;
using Portfolio.Api.Features.Places;
using Portfolio.Api.Features.Profile;
using Portfolio.Api.Features.Resume;
using Portfolio.Api.Features.Support;
using Portfolio.Api.Features.Terms;
using Portfolio.Api.Features.Updates;
using Portfolio.Api.Features.YouTube;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

builder.Services.AddDbContext<PortfolioDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddHealthChecks().AddDbContextCheck<PortfolioDbContext>();

builder.AddPortfolioAuth();

builder.Services.AddScoped<IFileStorage, DatabaseFileStorage>();
builder.Services.AddSingleton<CityIndex>();
builder.Services.AddSingleton<VisitorHasher>();

builder.Services.AddHttpClient<ILeetCodeClient, LeetCodeClient>(http =>
{
    http.BaseAddress = LeetCodeClient.BaseAddress;
    http.Timeout = TimeSpan.FromSeconds(10);
    http.DefaultRequestHeaders.Referrer = LeetCodeClient.BaseAddress;
    http.DefaultRequestHeaders.UserAgent.ParseAdd("jechel.dev-portfolio/1.0");
});
builder.Services.AddSingleton<LeetCodeMemoryCache>();
builder.Services.AddScoped<LeetCodeStatsService>();

builder.Services.Configure<YouTubeOptions>(builder.Configuration.GetSection(YouTubeOptions.Section));
builder.Services.AddHttpClient<IYouTubeClient, YouTubeClient>(http =>
{
    http.BaseAddress = YouTubeClient.BaseAddress;
    http.Timeout = TimeSpan.FromSeconds(15);
});
builder.Services.AddSingleton(services => new RefreshingCache<IReadOnlyList<YouTubeVideo>>(
    services.GetRequiredService<TimeProvider>(), YouTubeEndpoints.FreshFor, YouTubeEndpoints.RetryAfter));

builder.Services.Configure<SiteOptions>(builder.Configuration.GetSection(SiteOptions.Section));

// Phone alerts (ntfy): queued by any request, sent in the background.
builder.Services.Configure<AlertOptions>(builder.Configuration.GetSection(AlertOptions.Section));
builder.Services.AddSingleton<PhoneAlerts>();
builder.Services.AddSingleton<IPhoneAlerts>(services => services.GetRequiredService<PhoneAlerts>());
builder.Services.AddHttpClient(AlertWorker.HttpClientName, http => http.Timeout = TimeSpan.FromSeconds(10));
builder.Services.AddHostedService<AlertWorker>();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<CrashAlertHandler>();

builder.Services.Configure<SupportOptions>(builder.Configuration.GetSection(SupportOptions.Section));

// Email updates: Resend when a key is set, otherwise emails are only logged.
builder.Services.Configure<EmailOptions>(builder.Configuration.GetSection(EmailOptions.Section));
if (builder.Configuration.GetSection(EmailOptions.Section).Get<EmailOptions>()?.IsConfigured == true)
{
    builder.Services.AddHttpClient<IEmailSender, ResendEmailSender>(http =>
    {
        http.BaseAddress = ResendEmailSender.BaseAddress;
        http.Timeout = TimeSpan.FromSeconds(15);
    });
}
else
{
    builder.Services.AddSingleton<IEmailSender, LogEmailSender>();
}
builder.Services.AddScoped<UpdatesAnnouncer>();
builder.Services.AddHostedService<UpdatesWorker>();

// Subscribing sends an email, so each address (IP) gets a few tries per 10 minutes.
var subscribeLimit = builder.Configuration.GetValue("Updates:SubscribeLimitPer10Minutes", 5);
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(UpdatesEndpoints.RateLimitPolicy, http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = subscribeLimit, Window = TimeSpan.FromMinutes(10) }));
});

// Honour X-Forwarded-* from a reverse proxy (the Vite dev proxy locally), so URLs the API
// generates, like Google's OAuth callback, use the host and scheme the browser sees.
// Only loopback proxies are trusted by default; add KnownProxies/KnownNetworks when deploying.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost);

var app = builder.Build();

if (app.Configuration.GetValue<bool>("Database:MigrateOnStartup"))
{
    using var scope = app.Services.CreateScope();
    scope.ServiceProvider.GetRequiredService<PortfolioDbContext>().Database.Migrate();
}

app.UseForwardedHeaders();
app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

var api = app.MapGroup("/api");
api.MapHealthChecks("/health");
api.MapProfileEndpoints();
api.MapAuthEndpoints();
api.MapContactEndpoints();
api.MapAboutEndpoints();
api.MapFileEndpoints();
api.MapPlaceEndpoints();
api.MapLeetCodeEndpoints();
api.MapYouTubeEndpoints();
api.MapAppEndpoints();
api.MapTermsEndpoints();
api.MapAnalyticsEndpoints();
api.MapSupportEndpoints();
api.MapUpdatesEndpoints();
api.MapResumeEndpoints();

app.Run();
