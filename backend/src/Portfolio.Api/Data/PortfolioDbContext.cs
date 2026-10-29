using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Features.About;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Analytics;
using Portfolio.Api.Features.Apps;
using Portfolio.Api.Features.Auth;
using Portfolio.Api.Features.Contact;
using Portfolio.Api.Features.Files;
using Portfolio.Api.Features.LeetCode;
using Portfolio.Api.Features.Meetings;
using Portfolio.Api.Features.Profile;
using Portfolio.Api.Features.Resume;
using Portfolio.Api.Features.Settings;
using Portfolio.Api.Features.Site;
using Portfolio.Api.Features.Support;
using Portfolio.Api.Features.Terms;
using Portfolio.Api.Features.Updates;
using Portfolio.Api.Features.WorkWithMe;
using Portfolio.Api.Features.YouTube;

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
    public DbSet<PhoneAlertLog> PhoneAlertLogs => Set<PhoneAlertLog>();
    public DbSet<AlertPreference> AlertPreferences => Set<AlertPreference>();
    public DbSet<AlertChannelSetting> AlertChannels => Set<AlertChannelSetting>();
    public DbSet<PushDevice> PushDevices => Set<PushDevice>();
    public DbSet<WebPushKeys> WebPushKeys => Set<WebPushKeys>();
    public DbSet<WorkWithMePrice> WorkWithMePrices => Set<WorkWithMePrice>();

    /// <summary>ASP.NET Core Data Protection's keys (they encrypt cookies and saved secrets), so they survive redeploys.</summary>
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Every feature maps its own tables (Features/<Feature>/<Entity>.cs: an IEntityTypeConfiguration).
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(PortfolioDbContext).Assembly);

        modelBuilder.Entity<DataProtectionKey>(entity =>
        {
            entity.ToTable("data_protection_keys");
            entity.Property(k => k.Id).HasColumnName("id");
            entity.Property(k => k.FriendlyName).HasColumnName("friendly_name");
            entity.Property(k => k.Xml).HasColumnName("xml");
        });
    }
}
