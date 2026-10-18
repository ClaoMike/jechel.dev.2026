namespace Portfolio.Api.Data;

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

/// <summary>An answer the admin emailed to a contact message.</summary>
public class ContactReply
{
    public int Id { get; set; }
    public int MessageId { get; set; }
    public required string Text { get; set; }
    public DateTimeOffset SentAt { get; set; }
}
