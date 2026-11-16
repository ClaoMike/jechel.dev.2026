using Microsoft.EntityFrameworkCore;
using __NAMESPACE__.Api.Common;
using __NAMESPACE__.Api.Data;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(builder.Configuration.GetConnectionString("Default")));
builder.Services.AddHealthChecks().AddDbContextCheck<AppDbContext>();
builder.Services.AddProblemDetails();

var app = builder.Build();

if (app.Configuration.GetValue<bool>("Database:MigrateOnStartup"))
{
    using var scope = app.Services.CreateScope();
    scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.Migrate();
}

app.UseExceptionHandler();

var api = app.MapGroup("/api");
api.MapHealthChecks("/health");
// Every endpoint is a slice of its feature (Features/<Feature>/<Endpoint>.cs, an IEndpoint): all of them, found in the assembly.
api.MapEndpoints();

app.Run();
