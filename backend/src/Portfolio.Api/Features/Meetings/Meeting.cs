using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Portfolio.Api.Features.Meetings;

/// <summary>
/// A meeting booked through Cal.com (the Contact page's "Request a meeting"), as its webhook
/// reported it. The admin accepts or declines requests here or from the phone alert.
/// </summary>
public class Meeting
{
    public int Id { get; set; }

    /// <summary>Cal.com's booking uid; unique.</summary>
    public required string Uid { get; set; }

    public required string Title { get; set; }
    public DateTimeOffset StartTime { get; set; }
    public DateTimeOffset EndTime { get; set; }
    public required string AttendeeName { get; set; }
    public required string AttendeeEmail { get; set; }

    /// <summary>The attendee's time zone, e.g. "Europe/London".</summary>
    public string? AttendeeTimeZone { get; set; }

    /// <summary>What they wrote when booking.</summary>
    public string? Notes { get; set; }

    /// <summary>One of <see cref="Features.Meetings.MeetingStatus"/>.</summary>
    public required string Status { get; set; }

    /// <summary>SHA-256 (hex) of the token in the request alert's Accept / Decline buttons; null once decided.</summary>
    public string? DecisionTokenHash { get; set; }

    /// <summary>Which phone reminders went out, as <see cref="Features.Meetings.MeetingReminders"/> flags.</summary>
    public int RemindersSent { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>How <see cref="Meeting"/> is stored (its table and columns).</summary>
internal sealed class MeetingConfiguration : IEntityTypeConfiguration<Meeting>
{
    public void Configure(EntityTypeBuilder<Meeting> entity)
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
    }
}
