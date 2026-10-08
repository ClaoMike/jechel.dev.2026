using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Features.Contact;

namespace Portfolio.Api.Data;

public class PortfolioDbContext(DbContextOptions<PortfolioDbContext> options) : DbContext(options)
{
    public DbSet<Profile> Profiles => Set<Profile>();
    public DbSet<ContactMessage> ContactMessages => Set<ContactMessage>();

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

        modelBuilder.Entity<ContactMessage>(entity =>
        {
            entity.ToTable("contact_messages");
            entity.HasKey(m => m.Id);
            entity.Property(m => m.Id).HasColumnName("id");
            entity.Property(m => m.Name).HasColumnName("name").HasMaxLength(ContactRules.NameMaxLength).IsRequired();
            entity.Property(m => m.Email).HasColumnName("email").HasMaxLength(ContactRules.EmailMaxLength).IsRequired();
            entity.Property(m => m.Message).HasColumnName("message").HasMaxLength(ContactRules.MessageMaxLength).IsRequired();
            entity.Property(m => m.ReceivedAt).HasColumnName("received_at");
            entity.Property(m => m.ReadAt).HasColumnName("read_at");

            // The inbox lists newest first.
            entity.HasIndex(m => m.ReceivedAt);
        });
    }
}
