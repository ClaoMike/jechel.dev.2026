using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Features.Analytics;
using Portfolio.Api.Features.Contact;
using Portfolio.Api.Features.Files;

namespace Portfolio.Api.Data;

public class PortfolioDbContext(DbContextOptions<PortfolioDbContext> options) : DbContext(options)
{
    public DbSet<Profile> Profiles => Set<Profile>();
    public DbSet<ContactMessage> ContactMessages => Set<ContactMessage>();
    public DbSet<AboutPage> AboutPages => Set<AboutPage>();
    public DbSet<TermsPage> TermsPages => Set<TermsPage>();
    public DbSet<StoredFile> StoredFiles => Set<StoredFile>();
    public DbSet<LeetCodeSnapshot> LeetCodeStats => Set<LeetCodeSnapshot>();
    public DbSet<AppEntry> Apps => Set<AppEntry>();
    public DbSet<AppCategory> AppCategories => Set<AppCategory>();
    public DbSet<VisitSession> VisitSessions => Set<VisitSession>();
    public DbSet<VisitEvent> VisitEvents => Set<VisitEvent>();

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

        modelBuilder.Entity<TermsPage>(entity =>
        {
            entity.ToTable("terms_page");
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

        modelBuilder.Entity<AppEntry>(entity =>
        {
            entity.ToTable("apps");
            entity.HasKey(a => a.Id);
            entity.Property(a => a.Id).HasColumnName("id");
            entity.Property(a => a.Title).HasColumnName("title").HasMaxLength(Features.Apps.AppRules.TitleMaxLength).IsRequired();
            entity.Property(a => a.Description).HasColumnName("description").HasMaxLength(Features.Apps.AppRules.DescriptionMaxLength).IsRequired();
            entity.Property(a => a.Media).HasColumnName("media").HasColumnType("jsonb").IsRequired();
            entity.Property(a => a.CategoryIds).HasColumnName("category_ids").HasColumnType("jsonb").IsRequired().HasDefaultValueSql("'[]'::jsonb");
            entity.Property(a => a.Platforms).HasColumnName("platforms").HasColumnType("jsonb").IsRequired().HasDefaultValueSql("'[]'::jsonb");
            entity.Property(a => a.Links).HasColumnName("links").HasColumnType("jsonb").IsRequired().HasDefaultValueSql("'[]'::jsonb");
            entity.Property(a => a.CreatedAt).HasColumnName("created_at");
            entity.Property(a => a.UpdatedAt).HasColumnName("updated_at");

            // The grid lists newest first.
            entity.HasIndex(a => a.CreatedAt);
        });

        modelBuilder.Entity<AppCategory>(entity =>
        {
            entity.ToTable("app_categories");
            entity.HasKey(c => c.Id);
            entity.Property(c => c.Id).HasColumnName("id");
            entity.Property(c => c.Name).HasColumnName("name").HasMaxLength(Features.Apps.AppRules.CategoryNameMaxLength).IsRequired();
            entity.Property(c => c.Position).HasColumnName("position");
        });

        modelBuilder.Entity<VisitSession>(entity =>
        {
            entity.ToTable("visit_sessions");
            entity.HasKey(s => s.Id);
            entity.Property(s => s.Id).HasColumnName("id").ValueGeneratedNever();
            entity.Property(s => s.VisitorHash).HasColumnName("visitor_hash").HasMaxLength(64).IsRequired();
            entity.Property(s => s.StartedAt).HasColumnName("started_at");
            entity.Property(s => s.LastSeenAt).HasColumnName("last_seen_at");
            entity.Property(s => s.EntryPath).HasColumnName("entry_path").HasMaxLength(AnalyticsRules.PathMaxLength).IsRequired();
            entity.Property(s => s.Referrer).HasColumnName("referrer").HasMaxLength(AnalyticsRules.PathMaxLength);
            entity.Property(s => s.ReferrerHost).HasColumnName("referrer_host").HasMaxLength(AnalyticsRules.ShortTextMaxLength);
            entity.Property(s => s.UtmSource).HasColumnName("utm_source").HasMaxLength(AnalyticsRules.ShortTextMaxLength);
            entity.Property(s => s.UtmMedium).HasColumnName("utm_medium").HasMaxLength(AnalyticsRules.ShortTextMaxLength);
            entity.Property(s => s.UtmCampaign).HasColumnName("utm_campaign").HasMaxLength(AnalyticsRules.ShortTextMaxLength);
            entity.Property(s => s.UserAgent).HasColumnName("user_agent").HasMaxLength(AnalyticsRules.UserAgentMaxLength).IsRequired();
            entity.Property(s => s.Device).HasColumnName("device").HasMaxLength(20).IsRequired();
            entity.Property(s => s.Browser).HasColumnName("browser").HasMaxLength(40).IsRequired();
            entity.Property(s => s.OperatingSystem).HasColumnName("operating_system").HasMaxLength(40).IsRequired();
            entity.Property(s => s.Country).HasColumnName("country").HasMaxLength(2);
            entity.Property(s => s.Language).HasColumnName("language").HasMaxLength(35);
            entity.Property(s => s.TimeZone).HasColumnName("time_zone").HasMaxLength(64);
            entity.Property(s => s.ScreenWidth).HasColumnName("screen_width");
            entity.Property(s => s.ScreenHeight).HasColumnName("screen_height");
            entity.Property(s => s.ViewportWidth).HasColumnName("viewport_width");
            entity.Property(s => s.ViewportHeight).HasColumnName("viewport_height");
            entity.Property(s => s.Theme).HasColumnName("theme").HasMaxLength(20);
            entity.Property(s => s.LastTheme).HasColumnName("last_theme").HasMaxLength(20);
            entity.Property(s => s.PageViews).HasColumnName("page_views");
            entity.Property(s => s.InteractionCount).HasColumnName("interaction_count");
            entity.Property(s => s.EventCount).HasColumnName("event_count");
            entity.Property(s => s.ErrorCount).HasColumnName("error_count");

            // The dashboard reads by date, newest first.
            entity.HasIndex(s => s.StartedAt);
            entity.HasMany(s => s.Events).WithOne().HasForeignKey(e => e.SessionId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<VisitEvent>(entity =>
        {
            entity.ToTable("visit_events");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.SessionId).HasColumnName("session_id");
            entity.Property(e => e.Sequence).HasColumnName("sequence");
            entity.Property(e => e.OccurredAt).HasColumnName("occurred_at");
            entity.Property(e => e.Type).HasColumnName("type").HasMaxLength(20).IsRequired();
            entity.Property(e => e.Path).HasColumnName("path").HasMaxLength(AnalyticsRules.PathMaxLength).IsRequired();
            entity.Property(e => e.Label).HasColumnName("label").HasMaxLength(AnalyticsRules.LabelMaxLength);
            entity.Property(e => e.Detail).HasColumnName("detail").HasColumnType("jsonb");

            // One row per sequence number: a batch sent twice isn't stored twice.
            entity.HasIndex(e => new { e.SessionId, e.Sequence }).IsUnique();
            entity.HasIndex(e => e.OccurredAt);
        });
    }
}
