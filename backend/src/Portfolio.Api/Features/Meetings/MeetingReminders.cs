using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;

namespace Portfolio.Api.Features.Meetings;

/// <summary>
/// Phone reminders for accepted meetings: a day before, 2 hours before, 5 minutes before, and when it
/// starts. Sent by the site's own clock (not scheduled in ntfy, which only holds messages for 3 days),
/// each once. A reminder whose time passed while a later one is due (e.g. a meeting accepted an hour
/// before it starts) is skipped: only the latest one that's due goes out.
/// </summary>
public class MeetingReminders(PortfolioDbContext db, IPhoneAlerts alerts, IOptions<SiteOptions> site, TimeProvider time)
{
    /// <summary>The reminders, as flags in <see cref="Meeting.RemindersSent"/>, latest first.</summary>
    public static readonly IReadOnlyList<(int Flag, TimeSpan Before, string Label)> Schedule =
    [
        (8, TimeSpan.Zero, "Now"),
        (4, TimeSpan.FromMinutes(5), "In 5 minutes"),
        (2, TimeSpan.FromHours(2), "In 2 hours"),
        (1, TimeSpan.FromDays(1), "Tomorrow"),
    ];

    /// <summary>A start reminder still goes out if the site was down for up to this long past the start.</summary>
    public static readonly TimeSpan Late = TimeSpan.FromMinutes(10);

    /// <summary>Returns how many reminders went out.</summary>
    public async Task<int> SendDueAsync(CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        var soon = now + TimeSpan.FromDays(1) + TimeSpan.FromMinutes(1);
        var meetings = await db.Meetings
            .Where(m => m.Status == MeetingStatus.Accepted && m.StartTime <= soon && m.StartTime >= now - Late)
            .ToListAsync(cancellationToken);

        var sent = 0;
        foreach (var meeting in meetings)
        {
            var due = Schedule.Where(r => now >= meeting.StartTime - r.Before && (meeting.RemindersSent & r.Flag) == 0).ToList();
            if (due.Count == 0) continue;

            // The latest one that's due; the earlier ones are past (marked, not sent).
            var (_, _, label) = due[0];
            foreach (var reminder in due) meeting.RemindersSent |= reminder.Flag;
            var who = meeting.AttendeeName.Length > 0 ? meeting.AttendeeName : meeting.AttendeeEmail;
            alerts.Send(new PhoneAlert(
                AlertKinds.MeetingReminder,
                $"{label}: meeting with {who}",
                $"{PersonalEmails.FormatWhen(meeting.StartTime, site.Value.TimeZone)} · {meeting.Title}",
                "/contact",
                label == "Tomorrow" ? AlertPriority.Default : AlertPriority.High,
                "alarm_clock"));
            sent++;
        }
        await db.SaveChangesAsync(cancellationToken);
        return sent;
    }
}

/// <summary>Checks for due meeting reminders every <see cref="Interval"/>.</summary>
public class MeetingRemindersWorker(IServiceScopeFactory scopes, ILogger<MeetingRemindersWorker> logger) : BackgroundService
{
    public static readonly TimeSpan Interval = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<MeetingReminders>().SendDueAsync(stoppingToken);
            }
            catch (Exception e) when (!stoppingToken.IsCancellationRequested)
            {
                logger.LogError(e, "Sending meeting reminders failed.");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
