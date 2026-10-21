using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Updates;
using Portfolio.Api.Features.YouTube;
using Portfolio.Api.UnitTests.Features.Alerts;
using Portfolio.Api.UnitTests.Features.YouTube;

namespace Portfolio.Api.UnitTests.Features.Updates;

/// <summary>The worker that runs the announcer: every 10 minutes, and at once when poked (an email was approved).</summary>
public class UpdatesWorkerTests
{
    private readonly string _database = Guid.NewGuid().ToString();
    private readonly UpdatesTrigger _trigger = new();

    private ServiceProvider Services(bool broken = false)
    {
        var services = new ServiceCollection()
            .AddDbContext<PortfolioDbContext>(o => o.UseInMemoryDatabase(_database))
            .AddSingleton<IEmailSender, FakeEmailSender>()
            .AddSingleton<IPhoneAlerts, FakePhoneAlerts>()
            .AddSingleton<TimeProvider>(new FakeTimeProvider())
            .AddSingleton(Options.Create(new SiteOptions { PagesVisibleByDefault = true }))
            .AddSingleton<IOptionsMonitor<YouTubeOptions>>(TestOptions.Monitor(new YouTubeOptions()))
            .AddSingleton<IYouTubeClient>(new FakeYouTubeApi().Client())
            .AddSingleton<YouTubeVideoStore>()
            .AddLogging();
        if (!broken) services.AddScoped<UpdatesAnnouncer>();
        return services.BuildServiceProvider();
    }

    private bool StartMarked()
    {
        using var db = new PortfolioDbContext(new DbContextOptionsBuilder<PortfolioDbContext>().UseInMemoryDatabase(_database).Options);
        return db.UpdatesStates.Any();
    }

    [Fact]
    public async Task Runs_the_announcer_when_poked_instead_of_waiting()
    {
        using var services = Services();
        using var worker = new UpdatesWorker(services.GetRequiredService<IServiceScopeFactory>(), _trigger, NullLogger<UpdatesWorker>.Instance);
        await worker.StartAsync(default);

        _trigger.Poke();

        for (var i = 0; i < 200 && !StartMarked(); i++) await Task.Delay(10);
        Assert.True(StartMarked());
        await worker.StopAsync(default);
    }

    [Fact]
    public async Task Keeps_going_after_a_failed_run()
    {
        using var services = Services(broken: true);
        var logger = new CountingLogger();
        using var worker = new UpdatesWorker(services.GetRequiredService<IServiceScopeFactory>(), _trigger, logger);
        await worker.StartAsync(default);

        _trigger.Poke();
        for (var i = 0; i < 200 && logger.Errors < 1; i++) await Task.Delay(10);
        _trigger.Poke();
        for (var i = 0; i < 200 && logger.Errors < 2; i++) await Task.Delay(10);

        Assert.Equal(2, logger.Errors);
        await worker.StopAsync(default);
    }

    [Fact]
    public async Task Stops_with_the_API()
    {
        using var services = Services();
        using var worker = new UpdatesWorker(services.GetRequiredService<IServiceScopeFactory>(), _trigger, NullLogger<UpdatesWorker>.Instance);
        await worker.StartAsync(default);

        await worker.StopAsync(default);

        Assert.True(worker.ExecuteTask!.IsCompleted);
    }

    [Fact]
    public async Task A_poke_is_kept_once_however_many_times_it_comes()
    {
        _trigger.Poke();
        _trigger.Poke();

        Assert.True(await _trigger.WaitAsync(TimeSpan.Zero, default));
        Assert.False(await _trigger.WaitAsync(TimeSpan.Zero, default));
    }

    private sealed class CountingLogger : Microsoft.Extensions.Logging.ILogger<UpdatesWorker>
    {
        public int Errors;
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(Microsoft.Extensions.Logging.LogLevel logLevel) => true;
        public void Log<TState>(Microsoft.Extensions.Logging.LogLevel logLevel, Microsoft.Extensions.Logging.EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (logLevel == Microsoft.Extensions.Logging.LogLevel.Error) Interlocked.Increment(ref Errors);
        }
    }
}
