using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api;
using Portfolio.Api.Data;
using Portfolio.Api.Features.About;
using Portfolio.Api.Features.Auth;
using Portfolio.Api.Features.Contact;
using Portfolio.Api.Features.Files;
using Portfolio.Api.Features.LeetCode;
using Portfolio.Api.Features.Places;
using Portfolio.Api.Features.Profile;
using Portfolio.Api.Features.YouTube;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

builder.Services.AddDbContext<PortfolioDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddHealthChecks().AddDbContextCheck<PortfolioDbContext>();

builder.AddPortfolioAuth();

builder.Services.AddScoped<IFileStorage, DatabaseFileStorage>();
builder.Services.AddSingleton<CityIndex>();

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

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseAuthentication();
app.UseAuthorization();

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

app.Run();
