using Microsoft.EntityFrameworkCore;

namespace Portfolio.Api.Data;

public class PortfolioDbContext(DbContextOptions<PortfolioDbContext> options) : DbContext(options)
{
    public DbSet<Profile> Profiles => Set<Profile>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Profile>(entity =>
        {
            entity.ToTable("profiles");
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Id).HasColumnName("id");
            entity.Property(p => p.FirstName).HasColumnName("first_name").HasMaxLength(100).IsRequired();
            entity.Property(p => p.SessionTokenHash).HasColumnName("session_token_hash").HasMaxLength(64);
            entity.Property(p => p.SessionExpiresAt).HasColumnName("session_expires_at");

            entity.HasData(new Profile { Id = 1, FirstName = "Claudiu" });
        });
    }
}
