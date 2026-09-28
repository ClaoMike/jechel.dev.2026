using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Auth;
using Portfolio.Api.Features.Profile;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

builder.Services.AddDbContext<PortfolioDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddHealthChecks().AddDbContextCheck<PortfolioDbContext>();

builder.AddPortfolioAuth();

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

app.Run();
