using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Site;

namespace Portfolio.Api.UnitTests.Features.Site;

public class SiteEndpointsTests
{
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 19, 9, 0, 0, TimeSpan.Zero));

    private static async Task<SiteStatus> Status(IServiceProvider services) =>
        (await GetSiteStatus.Handle(services.Cache(), services, new DefaultHttpContext(), default)).Value!;

    private Task<Results<Ok<SiteStatus>, ValidationProblem>> Save(IServiceProvider services, SaveSiteRequest request)
    {
        var scope = services.CreateScope();
        return SaveSiteStatus.Handle(request, scope.ServiceProvider.GetRequiredService<PortfolioDbContext>(), services.Cache(), services.GetRequiredService<IOptions<SiteOptions>>(), _time, default);
    }

    [Fact]
    public async Task Everything_starts_hidden_and_out_of_maintenance()
    {
        var status = await Status(TestSite.Services(visibleByDefault: false));

        Assert.Equal(SiteParts.Pages, status.Pages.Keys);
        Assert.All(status.Pages.Values, Assert.False);
        Assert.All(status.Features.Values, Assert.False);
        Assert.False(status.Maintenance);
    }

    [Fact]
    public async Task Saving_changes_only_what_is_given_and_visitors_see_it_at_once()
    {
        var services = TestSite.Services(visibleByDefault: false);
        await Status(services); // now cached

        await Save(services, new SaveSiteRequest(new Dictionary<string, bool> { ["apps"] = true, ["about"] = true }, new Dictionary<string, bool> { ["coffee"] = true }, null, null));
        await Save(services, new SaveSiteRequest(new Dictionary<string, bool> { ["about"] = false }, null, true, "  Back at 18:00  "));

        var status = await Status(services);
        Assert.True(status.Pages["apps"]);
        Assert.False(status.Pages["about"]);
        Assert.False(status.Pages["contact"]);
        Assert.True(status.Features["coffee"]);
        Assert.Equal((true, "Back at 18:00"), (status.Maintenance, status.MaintenanceMessage));
    }

    [Fact]
    public async Task Unknown_pages_and_long_messages_are_refused()
    {
        var services = TestSite.Services();

        var result = await Save(services, new SaveSiteRequest(new Dictionary<string, bool> { ["admin"] = true }, new Dictionary<string, bool> { ["chat"] = true }, null, new string('m', 301)));

        Assert.Equal(["features", "maintenanceMessage", "pages"], Assert.IsType<ValidationProblem>(result.Result).ProblemDetails.Errors.Keys.Order());
    }

    [Fact]
    public async Task Pages_start_visible_when_the_site_says_so_and_a_feature_too_but_not_one_still_being_tested()
    {
        using var services = TestSite.Services(visibleByDefault: true);

        var status = await Status(services);

        Assert.All(status.Pages.Values, Assert.True);
        Assert.True(status.Features["coffee"]);
        Assert.True(status.Features["updates"]);
        Assert.False(status.Features["workWithMe"]);
    }

    [Fact]
    public async Task Work_with_me_is_a_switch_the_admin_can_turn_on_and_off()
    {
        using var services = TestSite.Services(visibleByDefault: true);

        var on = await Save(services, new SaveSiteRequest(null, new Dictionary<string, bool> { ["workWithMe"] = true }, null, null));
        Assert.True(Assert.IsType<Ok<SiteStatus>>(on.Result).Value!.Features["workWithMe"]);
        Assert.True((await Status(services)).Features["workWithMe"]);

        await Save(services, new SaveSiteRequest(null, new Dictionary<string, bool> { ["workWithMe"] = false }, null, null));
        Assert.False((await Status(services)).Features["workWithMe"]);
        Assert.True((await Status(services)).Features["coffee"]);
    }

    [Fact]
    public async Task Unknown_features_are_refused_and_nothing_changes()
    {
        using var services = TestSite.Services();

        var result = await Save(services, new SaveSiteRequest(null, new Dictionary<string, bool> { ["teleport"] = true }, true, null));

        Assert.IsType<ValidationProblem>(result.Result);
        Assert.False((await Status(services)).Maintenance);
    }

    [Fact]
    public async Task Turns_maintenance_on_and_off_with_a_trimmed_message()
    {
        using var services = TestSite.Services();

        await Save(services, new SaveSiteRequest(null, null, true, "  Back by 18:00  "));
        var on = await Status(services);
        await Save(services, new SaveSiteRequest(null, null, false, null));
        var off = await Status(services);

        Assert.Equal((true, "Back by 18:00"), (on.Maintenance, on.MaintenanceMessage));
        Assert.Equal((false, "Back by 18:00"), (off.Maintenance, off.MaintenanceMessage));
        Assert.Equal(_time.GetUtcNow(), off.UpdatedAt);
    }

    [Fact]
    public void Reads_a_damaged_saved_row_as_the_defaults()
    {
        var row = new Portfolio.Api.Features.Site.SiteState { Id = Portfolio.Api.Features.Site.SiteState.SingletonId, Pages = "not json", Features = "", MaintenanceMessage = "" };

        var status = SiteShared.ToStatus(row, visibleByDefault: true);

        Assert.All(status.Pages.Values, Assert.True);
        Assert.Equal(SiteParts.Features.ToDictionary(f => f, f => !SiteParts.OffUntilSwitchedOn.Contains(f)), status.Features);
    }

    [Fact]
    public async Task Reads_what_visitors_see_straight_from_the_database_for_background_work()
    {
        using var services = TestSite.Services(visibleByDefault: false);
        await Save(services, new SaveSiteRequest(new Dictionary<string, bool> { ["youtube"] = true }, null, null, null));
        using var scope = services.CreateScope();

        var visible = await SiteShared.VisibleAsync(scope.ServiceProvider.GetRequiredService<Portfolio.Api.Data.PortfolioDbContext>(), new Portfolio.Api.Features.Alerts.SiteOptions(), default);

        Assert.True(visible.Pages["youtube"]);
        Assert.False(visible.Pages["apps"]);
    }
}
