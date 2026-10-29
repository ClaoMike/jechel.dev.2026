using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Apps;
using Portfolio.Api.Features.Files;
using Portfolio.Api.UnitTests.Features.Alerts;

namespace Portfolio.Api.UnitTests.Features.Apps;

/// <summary>The admin's order of the apps (Organise), and which app What's new? shows.</summary>
public class AppOrderTests
{
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 22, 12, 0, 0, TimeSpan.Zero));
    private readonly PortfolioDbContext _db = new(new DbContextOptionsBuilder<PortfolioDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private DatabaseFileStorage Files => new(_db, _time);

    private async Task<AppDetails> CreateAsync(string title, bool? showInWhatsNew = null)
    {
        _time.Advance(TimeSpan.FromMinutes(1));
        var result = await CreateApp.Handle(new AppRequest(title, "", [], ShowInWhatsNew: showInWhatsNew), _db, Files, new FakePhoneAlerts(), Options.Create(new SiteOptions()), _time, default);
        return Assert.IsType<Created<AppDetails>>(result.Result).Value!;
    }

    private async Task<IReadOnlyList<string>> ListedAsync() => [.. (await ListApps.Handle(_db, default)).Value!.Items.Select(a => a.Title)];

    private async Task<IReadOnlyList<AppOrderItem>> SaveAsync(params AppOrderRequest?[] order) =>
        Assert.IsType<Ok<IReadOnlyList<AppOrderItem>>>((await SaveAppOrder.Handle(order, _db, default)).Result).Value!;

    private async Task<string?> WhatsNewAsync() => (await GetWhatsNewApp.Handle(_db, default)).Value!.App?.Title;

    [Fact]
    public async Task A_new_app_goes_first_and_the_others_keep_their_order()
    {
        var a = await CreateAsync("A");
        var b = await CreateAsync("B");
        await SaveAsync(new(a.Id, true), new(b.Id, true));

        await CreateAsync("C");

        Assert.Equal(["C", "A", "B"], await ListedAsync());
        Assert.Equal(["C", "A", "B"], (await ListAppOrder.Handle(_db, default)).Value!.Select(o => o.Title));
    }

    [Fact]
    public async Task The_saved_order_is_the_apps_pages_order_on_every_page()
    {
        var apps = new List<AppDetails>();
        for (var i = 1; i <= 11; i++) apps.Add(await CreateAsync($"App {i}"));

        // Oldest first now: App 1 … App 11.
        var saved = await SaveAsync([.. apps.Select(a => new AppOrderRequest(a.Id, true))]);

        Assert.Equal(apps.Select(a => a.Title), saved.Select(o => o.Title));
        Assert.Equal(["App 10", "App 11"], (await ListApps.Handle(_db, default, page: 2)).Value!.Items.Select(a => a.Title));
    }

    [Fact]
    public async Task Whats_new_shows_the_first_app_it_may_and_none_when_it_may_show_none()
    {
        Assert.Null(await WhatsNewAsync());
        var a = await CreateAsync("A");
        var b = await CreateAsync("B");
        var c = await CreateAsync("C");
        Assert.Equal("C", await WhatsNewAsync());

        // The first one may not: the next one that may.
        var saved = await SaveAsync(new(c.Id, false), new(a.Id, false), new(b.Id, true));
        Assert.Equal([false, false, true], saved.Select(o => o.ShowInWhatsNew));
        Assert.Equal("B", await WhatsNewAsync());
        Assert.False((await ListApps.Handle(_db, default)).Value!.Items[0].ShowInWhatsNew);

        await SaveAsync(new(c.Id, false), new(a.Id, false), new(b.Id, false));
        Assert.Null(await WhatsNewAsync());
    }

    [Fact]
    public async Task Whether_whats_new_may_show_it_is_set_when_adding_kept_when_left_out_and_changed_when_editing()
    {
        var shown = await CreateAsync("Shown");
        var hidden = await CreateAsync("Hidden", showInWhatsNew: false);
        Assert.True(shown.ShowInWhatsNew);
        Assert.False(hidden.ShowInWhatsNew);
        Assert.Equal("Shown", await WhatsNewAsync());

        // Left out (an older page): kept.
        var kept = await UpdateApp.Handle(hidden.Id, new AppRequest("Hidden", "", []), _db, Files, _time, default);
        Assert.False(Assert.IsType<Ok<AppDetails>>(kept.Result).Value!.ShowInWhatsNew);

        var changed = await UpdateApp.Handle(hidden.Id, new AppRequest("Hidden", "", [], ShowInWhatsNew: true), _db, Files, _time, default);
        Assert.True(Assert.IsType<Ok<AppDetails>>(changed.Result).Value!.ShowInWhatsNew);
        Assert.Equal("Hidden", await WhatsNewAsync());
    }

    [Fact]
    public async Task An_order_that_leaves_out_adds_or_repeats_an_app_changes_nothing()
    {
        var a = await CreateAsync("A");
        var b = await CreateAsync("B");

        foreach (var order in new AppOrderRequest?[][]
        {
            [new(a.Id, true)],
            [new(a.Id, true), new(b.Id, true), new(999, true)],
            [new(a.Id, true), new(a.Id, true)],
            [new(a.Id, true), new(b.Id, null)],
            [new(null, true), new(b.Id, true)],
            [null, new(b.Id, true)],
        })
        {
            Assert.IsType<ValidationProblem>((await SaveAppOrder.Handle(order, _db, default)).Result);
        }

        Assert.Equal(["B", "A"], await ListedAsync());
    }

    [Fact]
    public async Task An_app_deleted_while_the_order_is_saved_makes_it_out_of_date_not_an_error()
    {
        var database = Guid.NewGuid().ToString();
        var deleted = 0;
        // Deleted from another request, after the order was checked and before it's saved.
        var deleteFirst = new DeletingInterceptor(() =>
        {
            using var other = new PortfolioDbContext(new DbContextOptionsBuilder<PortfolioDbContext>().UseInMemoryDatabase(database).Options);
            other.Apps.Remove(other.Apps.Single(a => a.Id == deleted));
            other.SaveChanges();
        });
        await using var db = new PortfolioDbContext(new DbContextOptionsBuilder<PortfolioDbContext>().UseInMemoryDatabase(database).AddInterceptors(deleteFirst).Options);
        var (a, b) = (new AppEntry { Title = "A", Description = "", Media = "[]" }, new AppEntry { Title = "B", Description = "", Media = "[]" });
        db.Apps.AddRange(a, b);
        await db.SaveChangesAsync();
        deleted = a.Id;
        deleteFirst.Armed = true;

        var result = await SaveAppOrder.Handle([new(b.Id, true), new(a.Id, true)], db, default);

        var problem = Assert.IsType<ValidationProblem>(result.Result);
        Assert.Equal(AppRules.OrderOutOfDate, problem.ProblemDetails.Errors[""][0]);
    }

    private sealed class DeletingInterceptor(Action delete) : SaveChangesInterceptor
    {
        public bool Armed { get; set; }

        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (Armed)
            {
                Armed = false;
                delete();
            }
            return base.SavingChangesAsync(eventData, result, cancellationToken);
        }
    }

    [Fact]
    public void Says_why_an_order_cant_be_saved()
    {
        Assert.Equal("The order is required.", AppRules.ValidateOrder(null, [1])[""][0]);
        Assert.Equal("An app is listed twice.", AppRules.ValidateOrder([new(1, true), new(1, true)], [1])[""][0]);
        Assert.Equal(AppRules.OrderOutOfDate, AppRules.ValidateOrder([new(1, true)], [1, 2])[""][0]);
        Assert.Equal(["[0].id", "[1].showInWhatsNew"], AppRules.ValidateOrder([new(null, true), new(2, null)], [1, 2]).Keys.Order());
        Assert.Empty(AppRules.ValidateOrder([], []));
    }
}
