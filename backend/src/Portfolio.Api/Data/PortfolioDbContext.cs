using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Features.Contact;
using Portfolio.Api.Features.Files;

namespace Portfolio.Api.Data;

public class PortfolioDbContext(DbContextOptions<PortfolioDbContext> options) : DbContext(options)
{
    public DbSet<Profile> Profiles => Set<Profile>();
    public DbSet<ContactMessage> ContactMessages => Set<ContactMessage>();
    public DbSet<AboutPage> AboutPages => Set<AboutPage>();
    public DbSet<StoredFile> StoredFiles => Set<StoredFile>();
    public DbSet<LeetCodeSnapshot> LeetCodeStats => Set<LeetCodeSnapshot>();

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

        modelBuilder.Entity<AboutPage>(entity =>
        {
            entity.ToTable("about_page");
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Id).HasColumnName("id").ValueGeneratedNever();
            entity.Property(p => p.Content).HasColumnName("content").HasColumnType("jsonb").IsRequired();
            entity.Property(p => p.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<StoredFile>(entity =>
        {
            entity.ToTable("stored_files");
            entity.HasKey(f => f.Id);
            entity.Property(f => f.Id).HasColumnName("id").ValueGeneratedNever();
            entity.Property(f => f.FileName).HasColumnName("file_name").HasMaxLength(FileRules.FileNameMaxLength).IsRequired();
            entity.Property(f => f.ContentType).HasColumnName("content_type").HasMaxLength(100).IsRequired();
            entity.Property(f => f.Content).HasColumnName("content").IsRequired();
            entity.Property(f => f.CreatedAt).HasColumnName("created_at");
        });

        modelBuilder.Entity<LeetCodeSnapshot>(entity =>
        {
            entity.ToTable("leetcode_stats");
            entity.HasKey(s => s.Username);
            entity.Property(s => s.Username).HasColumnName("username").HasMaxLength(50);
            entity.Property(s => s.Stats).HasColumnName("stats").HasColumnType("jsonb").IsRequired();
            entity.Property(s => s.FetchedAt).HasColumnName("fetched_at");
        });
    }
}
