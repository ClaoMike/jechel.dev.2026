using Microsoft.EntityFrameworkCore;
using __NAMESPACE__.Api.Features.Greetings;

namespace __NAMESPACE__.Api.Data;

/// <summary>The database: every feature maps its own tables (Features/&lt;Feature&gt;/&lt;Entity&gt;.cs).</summary>
public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Greeting> Greetings => Set<Greeting>();

    protected override void OnModelCreating(ModelBuilder modelBuilder) =>
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
}
