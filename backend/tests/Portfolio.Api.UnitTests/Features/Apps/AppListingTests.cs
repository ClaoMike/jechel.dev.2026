using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Apps;
using Portfolio.Api.Features.Files;
using Portfolio.Api.UnitTests.Features.Alerts;

namespace Portfolio.Api.UnitTests.Features.Apps;

/// <summary>Listing apps a page at a time, and changing ones that aren't there.</summary>
public class AppListingTests
{
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 11, 12, 0, 0, TimeSpan.Zero));
    private readonly PortfolioDbContext _db = new(new DbContextOptionsBuilder<PortfolioDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private readonly FakePhoneAlerts _alerts = new();

    private DatabaseFileStorage Files => new(_db, _time);

    private async Task AddAsync(int count, bool sameTime = false)
    {
        for (var i = 1; i <= count; i++)
        {
            if (!sameTime) _time.Advance(TimeSpan.FromMinutes(1));
            await CreateApp.Handle(new AppRequest($"App {i}", "", []), _db, Files, _alerts, Options.Create(new SiteOptions()), _time, default);
        }
    }

    private async Task<PagedResponse<AppDetails>> ListAsync(int page = 1, int pageSize = AppShared.DefaultPageSize) =>
        (await ListApps.Handle(_db, default, page, pageSize)).Value!;

    [Fact]
    public async Task Lists_nine_a_page_newest_first_with_the_total()
    {
        await AddAsync(11);

        var first = await ListAsync();
        var second = await ListAsync(page: 2);

        Assert.Equal(["App 11", "App 10", "App 9", "App 8", "App 7", "App 6", "App 5", "App 4", "App 3"], first.Items.Select(a => a.Title));
        Assert.Equal(["App 2", "App 1"], second.Items.Select(a => a.Title));
        Assert.Equal((11, 11), (first.TotalCount, second.TotalCount));
    }

    [Fact]
    public async Task Apps_added_at_the_same_moment_are_newest_first_by_when_they_were_added()
    {
        await AddAsync(3, sameTime: true);

        Assert.Equal(["App 3", "App 2", "App 1"], (await ListAsync()).Items.Select(a => a.Title));
    }

    [Theory]
    [InlineData(0, 9, 1, 9)]
    [InlineData(-5, 9, 1, 9)]
    [InlineData(1, 0, 1, 1)]
    [InlineData(1, 1000, 1, 50)]
    public async Task Keeps_the_page_and_its_size_within_bounds(int page, int pageSize, int expectedPage, int expectedSize)
    {
        await AddAsync(2);

        var result = await ListAsync(page, pageSize);

        Assert.Equal((expectedPage, expectedSize), (result.Page, result.PageSize));
    }

    [Fact]
    public async Task Has_nothing_past_the_last_page_but_still_says_how_many_there_are()
    {
        await AddAsync(2);

        var past = await ListAsync(page: 5);

        Assert.Empty(past.Items);
        Assert.Equal(2, past.TotalCount);
    }

    [Fact]
    public async Task Has_nothing_at_all_to_start_with()
    {
        var empty = await ListAsync();

        Assert.Empty(empty.Items);
        Assert.Equal(0, empty.TotalCount);
    }

    [Fact]
    public async Task Changing_or_deleting_an_app_that_isnt_there_is_not_found()
    {
        var update = await UpdateApp.Handle(404, new AppRequest("App", "", []), _db, Files, _time, default);
        var delete = await DeleteApp.Handle(404, _db, Files, _time, default);

        Assert.IsType<NotFound>(update.Result);
        Assert.IsType<NotFound>(delete.Result);
    }

    [Fact]
    public async Task An_invalid_change_is_refused_before_looking_for_the_app_and_changes_nothing()
    {
        await AddAsync(1);
        var id = (await ListAsync()).Items[0].Id;

        var update = await UpdateApp.Handle(id, new AppRequest("", "", []), _db, Files, _time, default);

        Assert.IsType<ValidationProblem>(update.Result);
        Assert.Equal("App 1", (await ListAsync()).Items[0].Title);
    }

    [Fact]
    public async Task Changing_an_app_keeps_when_it_was_added_and_its_place_in_the_list()
    {
        await AddAsync(2);
        var older = (await ListAsync()).Items[1];
        _time.Advance(TimeSpan.FromDays(3));

        var changed = Assert.IsType<Ok<AppDetails>>((await UpdateApp.Handle(older.Id, new AppRequest("Renamed", "", []), _db, Files, _time, default)).Result).Value!;

        Assert.Equal(older.CreatedAt, changed.CreatedAt);
        Assert.Equal(["App 2", "Renamed"], (await ListAsync()).Items.Select(a => a.Title));
    }

    [Fact]
    public async Task Keeps_media_in_the_order_given_and_links_elsewhere_as_they_are()
    {
        var media = new[] { new AppMedia(" https://cdn.example.com/b.png ", "image"), new AppMedia("https://youtu.be/dQw4w9WgXcQ", "youtube"), new AppMedia("https://cdn.example.com/a.mp4", "video") };

        var created = Assert.IsType<Created<AppDetails>>((await CreateApp.Handle(new AppRequest("App", "", media), _db, Files, _alerts, Options.Create(new SiteOptions()), _time, default)).Result).Value!;

        Assert.Equal(
            ["https://cdn.example.com/b.png", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://cdn.example.com/a.mp4"],
            created.Media.Select(m => m.Url));
    }
}
