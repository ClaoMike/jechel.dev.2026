using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Terms;

namespace Portfolio.Api.Features.Analytics;

/// <summary>
/// Deletes visits (and their events) older than the terms say they're kept
/// (<see cref="TermsDefaults.VisitRetentionMonths"/> months after the visit), as the API starts and then daily.
/// </summary>
public class AnalyticsRetention(IServiceScopeFactory scopes, TimeProvider time, ILogger<AnalyticsRetention> logger) : BackgroundService
{
    public static readonly TimeSpan Interval = TimeSpan.FromDays(1);

    /// <summary>Deletes the visits last seen before the retention period; returns how many.</summary>
    public static Task<int> DeleteExpiredAsync(PortfolioDbContext db, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var cutoff = now.AddMonths(-TermsDefaults.VisitRetentionMonths);
        // Their events go with them (ON DELETE CASCADE).
        return db.VisitSessions.Where(s => s.LastSeenAt < cutoff).ExecuteDeleteAsync(cancellationToken);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var deleted = await DeleteExpiredAsync(scope.ServiceProvider.GetRequiredService<PortfolioDbContext>(), time.GetUtcNow(), stoppingToken);
                if (deleted > 0) logger.LogInformation("Deleted {Count} visits older than {Months} months.", deleted, TermsDefaults.VisitRetentionMonths);
            }
            catch (Exception e) when (!stoppingToken.IsCancellationRequested)
            {
                logger.LogError(e, "Deleting old visits failed.");
            }
            await Task.Delay(Interval, time, stoppingToken);
        }
    }
}
