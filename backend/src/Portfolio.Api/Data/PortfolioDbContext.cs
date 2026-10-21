using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Features.Analytics;
using Portfolio.Api.Features.Auth;
using Portfolio.Api.Features.Contact;
using Portfolio.Api.Features.Files;

namespace Portfolio.Api.Data;

public class PortfolioDbContext(DbContextOptions<PortfolioDbContext> options) : DbContext(options), IDataProtectionKeyContext
{
    public DbSet<Profile> Profiles => Set<Profile>();
    public DbSet<AdminSession> AdminSessions => Set<AdminSession>();
    public DbSet<ContactMessage> ContactMessages => Set<ContactMessage>();
    public DbSet<AboutPage> AboutPages => Set<AboutPage>();
    public DbSet<TermsPage> TermsPages => Set<TermsPage>();
    public DbSet<StoredFile> StoredFiles => Set<StoredFile>();
    public DbSet<LeetCodeSnapshot> LeetCodeStats => Set<LeetCodeSnapshot>();
    public DbSet<YouTubeSnapshot> YouTubeSnapshots => Set<YouTubeSnapshot>();
    public DbSet<AppEntry> Apps => Set<AppEntry>();
    public DbSet<AppCategory> AppCategories => Set<AppCategory>();
    public DbSet<VisitSession> VisitSessions => Set<VisitSession>();
    public DbSet<VisitEvent> VisitEvents => Set<VisitEvent>();
    public DbSet<Donation> Donations => Set<Donation>();
    public DbSet<Subscriber> Subscribers => Set<Subscriber>();
    public DbSet<Announcement> Announcements => Set<Announcement>();
    public DbSet<UpdatesState> UpdatesStates => Set<UpdatesState>();
    public DbSet<UpdateEmailsPage> UpdateEmailsPages => Set<UpdateEmailsPage>();
    public DbSet<ResumeSettings> ResumeSettings => Set<ResumeSettings>();
    public DbSet<SiteSetting> SiteSettings => Set<SiteSetting>();
    public DbSet<Meeting> Meetings => Set<Meeting>();
    public DbSet<ContactReply> ContactReplies => Set<ContactReply>();
    public DbSet<SiteState> SiteStates => Set<SiteState>();

    /// <summary>ASP.NET Core Data Protection's keys (they encrypt cookies and saved secrets), so they survive redeploys.</summary>
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Profile>(entity =>
        {
            entity.ToTable("profiles");
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Id).HasColumnName("id");
            entity.Property(p => p.FirstName).HasColumnName("first_name").HasMaxLength(100).IsRequired();

            entity.HasData(new Profile { Id = 1, FirstName = "Claudiu" });
        });

        modelBuilder.Entity<AdminSession>(entity =>
        {
            entity.ToTable("admin_sessions");
            entity.HasKey(s => s.Id);
            entity.Property(s => s.Id).HasColumnName("id").ValueGeneratedNever();
            entity.Property(s => s.TokenHash).HasColumnName("token_hash").HasMaxLength(64).IsRequired();
            entity.Property(s => s.Email).HasColumnName("email").HasMaxLength(320).IsRequired();
            entity.Property(s => s.CreatedAt).HasColumnName("created_at");
            entity.Property(s => s.LastSeenAt).HasColumnName("last_seen_at");
            entity.Property(s => s.ExpiresAt).HasColumnName("expires_at");
            entity.Property(s => s.EndsAt).HasColumnName("ends_at");
            entity.Property(s => s.UserAgent).HasColumnName("user_agent").HasMaxLength(AdminSessionService.UserAgentMaxLength).IsRequired();
            entity.Property(s => s.IpAddress).HasColumnName("ip_address").HasMaxLength(45);
            entity.Property(s => s.Country).HasColumnName("country").HasMaxLength(2);

            // Every request with the cookie finds its session by the token's hash.
            entity.HasIndex(s => s.TokenHash).IsUnique();
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

        modelBuilder.Entity<YouTubeSnapshot>(entity =>
        {
            entity.ToTable("youtube_videos");
            entity.HasKey(s => s.Channel);
            entity.Property(s => s.Channel).HasColumnName("channel").HasMaxLength(100);
            entity.Property(s => s.Videos).HasColumnName("videos").HasColumnType("jsonb").IsRequired();
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

        modelBuilder.Entity<Donation>(entity =>
        {
            entity.ToTable("donations");
            entity.HasKey(d => d.Id);
            entity.Property(d => d.Id).HasColumnName("id");
            entity.Property(d => d.TransactionId).HasColumnName("transaction_id").HasMaxLength(100).IsRequired();
            entity.Property(d => d.Type).HasColumnName("type").HasMaxLength(40).IsRequired();
            entity.Property(d => d.FromName).HasColumnName("from_name").HasMaxLength(200).IsRequired();
            entity.Property(d => d.Message).HasColumnName("message").HasMaxLength(2000);
            entity.Property(d => d.Amount).HasColumnName("amount").HasMaxLength(20).IsRequired();
            entity.Property(d => d.Currency).HasColumnName("currency").HasMaxLength(10).IsRequired();
            entity.Property(d => d.Email).HasColumnName("email").HasMaxLength(320);
            entity.Property(d => d.Payload).HasColumnName("payload").HasColumnType("jsonb");
            entity.Property(d => d.ReceivedAt).HasColumnName("received_at");
            entity.Property(d => d.IsTest).HasColumnName("is_test");

            // A webhook is retried until it gets a 200: one row per event on a payment.
            entity.HasIndex(d => d.TransactionId).IsUnique();
            entity.HasIndex(d => d.ReceivedAt);
        });

        modelBuilder.Entity<Subscriber>(entity =>
        {
            entity.ToTable("subscribers");
            entity.HasKey(s => s.Id);
            entity.Property(s => s.Id).HasColumnName("id");
            entity.Property(s => s.Email).HasColumnName("email").HasMaxLength(ContactRules.EmailMaxLength).IsRequired();
            entity.Property(s => s.Token).HasColumnName("token").HasMaxLength(100).IsRequired();
            entity.Property(s => s.CreatedAt).HasColumnName("created_at");
            entity.Property(s => s.ConfirmationSentAt).HasColumnName("confirmation_sent_at");
            entity.Property(s => s.ConfirmedAt).HasColumnName("confirmed_at");

            entity.HasIndex(s => s.Email).IsUnique();
            entity.HasIndex(s => s.Token).IsUnique();
        });

        modelBuilder.Entity<Announcement>(entity =>
        {
            entity.ToTable("announcements");
            entity.HasKey(a => a.Id);
            entity.Property(a => a.Id).HasColumnName("id");
            entity.Property(a => a.Kind).HasColumnName("kind").HasMaxLength(20).IsRequired();
            entity.Property(a => a.ItemKey).HasColumnName("item_key").HasMaxLength(100).IsRequired();
            entity.Property(a => a.Title).HasColumnName("title").HasMaxLength(200).IsRequired();
            entity.Property(a => a.Status).HasColumnName("status").HasMaxLength(20).IsRequired();
            entity.Property(a => a.DecisionTokenHash).HasColumnName("decision_token_hash").HasMaxLength(64);
            entity.Property(a => a.CreatedAt).HasColumnName("created_at");
            entity.Property(a => a.SentAt).HasColumnName("sent_at");
            entity.Property(a => a.RecipientCount).HasColumnName("recipient_count");

            // Nothing is announced twice.
            entity.HasIndex(a => new { a.Kind, a.ItemKey }).IsUnique();
        });

        modelBuilder.Entity<UpdatesState>(entity =>
        {
            entity.ToTable("updates_state");
            entity.HasKey(s => s.Id);
            entity.Property(s => s.Id).HasColumnName("id").ValueGeneratedNever();
            entity.Property(s => s.AnnounceAfter).HasColumnName("announce_after");
        });

        modelBuilder.Entity<UpdateEmailsPage>(entity =>
        {
            entity.ToTable("update_emails");
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Id).HasColumnName("id").ValueGeneratedNever();
            entity.Property(p => p.Content).HasColumnName("content").HasColumnType("jsonb").IsRequired();
            entity.Property(p => p.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<ResumeSettings>(entity =>
        {
            entity.ToTable("resume");
            entity.HasKey(r => r.Id);
            entity.Property(r => r.Id).HasColumnName("id").ValueGeneratedNever();
            entity.Property(r => r.Phone).HasColumnName("phone").HasMaxLength(Features.Resume.ResumeRules.PhoneMaxLength).IsRequired();
            entity.Property(r => r.Email).HasColumnName("email").HasMaxLength(ContactRules.EmailMaxLength).IsRequired();
            entity.Property(r => r.Headline).HasColumnName("headline").HasMaxLength(Features.Resume.ResumeRules.HeadlineMaxLength).IsRequired();
            entity.Property(r => r.Sections).HasColumnName("sections").HasColumnType("jsonb").IsRequired();
            entity.Property(r => r.ExcludedSkills).HasColumnName("excluded_skills").HasColumnType("jsonb").IsRequired().HasDefaultValueSql("'[]'::jsonb");
            entity.Property(r => r.PublicPdf).HasColumnName("public_pdf");
            entity.Property(r => r.PrivatePdf).HasColumnName("private_pdf");
            entity.Property(r => r.GeneratedAt).HasColumnName("generated_at");
        });

        modelBuilder.Entity<SiteSetting>(entity =>
        {
            entity.ToTable("site_settings");
            entity.HasKey(s => s.Key);
            entity.Property(s => s.Key).HasColumnName("key").HasMaxLength(100);
            entity.Property(s => s.Value).HasColumnName("value").IsRequired();
            entity.Property(s => s.IsEncrypted).HasColumnName("is_encrypted");
            entity.Property(s => s.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<Meeting>(entity =>
        {
            entity.ToTable("meetings");
            entity.HasKey(m => m.Id);
            entity.Property(m => m.Id).HasColumnName("id");
            entity.Property(m => m.Uid).HasColumnName("uid").HasMaxLength(100).IsRequired();
            entity.Property(m => m.Title).HasColumnName("title").HasMaxLength(300).IsRequired();
            entity.Property(m => m.StartTime).HasColumnName("start_time");
            entity.Property(m => m.EndTime).HasColumnName("end_time");
            entity.Property(m => m.AttendeeName).HasColumnName("attendee_name").HasMaxLength(200).IsRequired();
            entity.Property(m => m.AttendeeEmail).HasColumnName("attendee_email").HasMaxLength(320).IsRequired();
            entity.Property(m => m.AttendeeTimeZone).HasColumnName("attendee_time_zone").HasMaxLength(64);
            entity.Property(m => m.Notes).HasColumnName("notes").HasMaxLength(2000);
            entity.Property(m => m.Status).HasColumnName("status").HasMaxLength(20).IsRequired();
            entity.Property(m => m.DecisionTokenHash).HasColumnName("decision_token_hash").HasMaxLength(64);
            entity.Property(m => m.RemindersSent).HasColumnName("reminders_sent");
            entity.Property(m => m.CreatedAt).HasColumnName("created_at");
            entity.Property(m => m.UpdatedAt).HasColumnName("updated_at");

            entity.HasIndex(m => m.Uid).IsUnique();
            // The calendar and the reminders read by time.
            entity.HasIndex(m => m.StartTime);
        });

        modelBuilder.Entity<ContactReply>(entity =>
        {
            entity.ToTable("contact_replies");
            entity.HasKey(r => r.Id);
            entity.Property(r => r.Id).HasColumnName("id");
            entity.Property(r => r.MessageId).HasColumnName("message_id");
            entity.Property(r => r.Text).HasColumnName("text").HasMaxLength(Features.Contact.ContactEndpoints.ReplyMaxLength).IsRequired();
            entity.Property(r => r.SentAt).HasColumnName("sent_at");

            // Deleting a message deletes its replies.
            entity.HasOne<ContactMessage>().WithMany().HasForeignKey(r => r.MessageId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(r => r.MessageId);
        });

        modelBuilder.Entity<SiteState>(entity =>
        {
            entity.ToTable("site_state");
            entity.HasKey(s => s.Id);
            entity.Property(s => s.Id).HasColumnName("id").ValueGeneratedNever();
            entity.Property(s => s.Pages).HasColumnName("pages").HasColumnType("jsonb").IsRequired();
            entity.Property(s => s.Features).HasColumnName("features").HasColumnType("jsonb").IsRequired();
            entity.Property(s => s.MaintenanceEnabled).HasColumnName("maintenance_enabled");
            entity.Property(s => s.MaintenanceMessage).HasColumnName("maintenance_message").HasMaxLength(Features.Site.SiteEndpoints.MessageMaxLength).IsRequired();
            entity.Property(s => s.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<DataProtectionKey>(entity =>
        {
            entity.ToTable("data_protection_keys");
            entity.Property(k => k.Id).HasColumnName("id");
            entity.Property(k => k.FriendlyName).HasColumnName("friendly_name");
            entity.Property(k => k.Xml).HasColumnName("xml");
        });
    }
}
