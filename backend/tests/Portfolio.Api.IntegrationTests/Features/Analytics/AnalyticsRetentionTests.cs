using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Analytics;
using Portfolio.Api.Features.Terms;

namespace Portfolio.Api.IntegrationTests.Features.Analytics;

/// <summary>Visits are deleted once they're older than the terms say they're kept (real PostgreSQL: the events go too).</summary>
[Collection(ApiCollection.Name)]
public class AnalyticsRetentionTests(PortfolioApiFactory factory)
{
    private static readonly DateTimeOffset Now = new(2026, 10, 21, 12, 0, 0, TimeSpan.Zero);

    private static VisitSession Visit(DateTimeOffset lastSeen) => new()
    {
        Id = Guid.NewGuid(),
        VisitorHash = "hash",
        StartedAt = lastSeen.AddMinutes(-5),
        LastSeenAt = lastSeen,
        EntryPath = "/",
        UserAgent = "test",
        Device = "desktop",
        Browser = "Chrome",
        OperatingSystem = "macOS",
        Events = [new VisitEvent { Sequence = 1, Type = "pageview", Path = "/", OccurredAt = lastSeen }],
    };

    [Fact]
    public async Task Deletes_visits_older_than_the_terms_say_with_their_events_and_keeps_the_rest()
    {
        var old = Visit(Now.AddMonths(-TermsDefaults.VisitRetentionMonths).AddMinutes(-1));
        var recent = Visit(Now.AddMonths(-TermsDefaults.VisitRetentionMonths).AddMinutes(1));
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PortfolioDbContext>();
        db.VisitSessions.AddRange(old, recent);
        await db.SaveChangesAsync();

        var deleted = await AnalyticsRetention.DeleteExpiredAsync(db, Now, CancellationToken.None);

        Assert.True(deleted >= 1);
        Assert.False(await db.VisitSessions.AnyAsync(s => s.Id == old.Id));
        Assert.False(await db.VisitEvents.AnyAsync(e => e.SessionId == old.Id));
        Assert.True(await db.VisitSessions.AnyAsync(s => s.Id == recent.Id));
        Assert.True(await db.VisitEvents.AnyAsync(e => e.SessionId == recent.Id));
    }

    [Fact]
    public async Task Runs_as_the_API_starts_then_every_day()
    {
        var time = new FakeTimeProvider(Now);
        var scopes = factory.Services.GetRequiredService<IServiceScopeFactory>();
        async Task<Guid> AddVisitAsync(DateTimeOffset lastSeen)
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<PortfolioDbContext>();
            var visit = Visit(lastSeen);
            db.VisitSessions.Add(visit);
            await db.SaveChangesAsync();
            return visit.Id;
        }
        async Task<bool> ExistsAsync(Guid id)
        {
            using var scope = scopes.CreateScope();
            return await scope.ServiceProvider.GetRequiredService<PortfolioDbContext>().VisitSessions.AnyAsync(s => s.Id == id);
        }
        var oldAtStart = await AddVisitAsync(Now.AddYears(-2));
        // Turns 12 months old during the next day.
        var oldTomorrow = await AddVisitAsync(Now.AddMonths(-TermsDefaults.VisitRetentionMonths).AddHours(12));

        using var job = new AnalyticsRetention(scopes, time, NullLogger<AnalyticsRetention>.Instance);
        await job.StartAsync(CancellationToken.None);
        for (var i = 0; i < 200 && await ExistsAsync(oldAtStart); i++) await Task.Delay(25);
        Assert.False(await ExistsAsync(oldAtStart));
        Assert.True(await ExistsAsync(oldTomorrow));

        // Lets the job reach its wait for the next day before the clock moves on.
        await Task.Delay(100);
        time.Advance(AnalyticsRetention.Interval);
        for (var i = 0; i < 200 && await ExistsAsync(oldTomorrow); i++) await Task.Delay(25);
        Assert.False(await ExistsAsync(oldTomorrow));
        await job.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Keeps_going_after_a_failed_run()
    {
        var time = new FakeTimeProvider(Now);
        var broken = new BrokenThenWorking(factory.Services.GetRequiredService<IServiceScopeFactory>());

        using var job = new AnalyticsRetention(broken, time, NullLogger<AnalyticsRetention>.Instance);
        await job.StartAsync(CancellationToken.None);
        for (var i = 0; i < 200 && broken.Tries < 1; i++) await Task.Delay(25);
        await Task.Delay(100);
        time.Advance(AnalyticsRetention.Interval);
        for (var i = 0; i < 200 && broken.Tries < 2; i++) await Task.Delay(25);
        await job.StopAsync(CancellationToken.None);

        Assert.Equal(2, broken.Tries);
    }

    /// <summary>The database is down the first time, back the next.</summary>
    private sealed class BrokenThenWorking(IServiceScopeFactory real) : IServiceScopeFactory
    {
        public int Tries { get; private set; }

        public IServiceScope CreateScope() => ++Tries == 1 ? throw new InvalidOperationException("The database is down.") : real.CreateScope();
    }
}
