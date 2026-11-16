using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.About;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Apps;
using Portfolio.Api.Features.Files;
using Portfolio.Api.Features.Updates;
using Portfolio.Api.UnitTests.Features.Alerts;

namespace Portfolio.Api.UnitTests.Features.Apps;

public class AppEndpointsTests
{
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 11, 12, 0, 0, TimeSpan.Zero));
    private readonly PortfolioDbContext _db = new(new DbContextOptionsBuilder<PortfolioDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    private readonly FakePhoneAlerts _alerts = new();
    private static readonly IOptions<SiteOptions> Site = Options.Create(new SiteOptions { PublicUrl = "https://jechel.dev", PagesVisibleByDefault = true });

    private DatabaseFileStorage Files => new(_db, _time);

    private async Task<AppDetails> CreateAsync(string title, params AppMedia[] media)
    {
        var result = await CreateApp.Handle(new AppRequest($" {title} ", " About it ", media), _db, Files, _alerts, Site, _time, default);
        return Assert.IsType<Created<AppDetails>>(result.Result).Value!;
    }

    private async Task<AppMedia> UploadAsync(string kind = AppMediaKinds.Image)
    {
        var id = await Files.SaveAsync("image.webp", "image/webp", [1], default);
        return new AppMedia(FileRules.UrlFor(id, "image.webp"), kind);
    }

    [Fact]
    public async Task Created_apps_are_listed_newest_first_and_trimmed()
    {
        var older = await CreateAsync("Older");
        _time.Advance(TimeSpan.FromMinutes(1));
        var newer = await CreateAsync("Newer", await UploadAsync(), await UploadAsync(AppMediaKinds.Video));

        var page = (await ListApps.Handle(_db, default)).Value!;

        Assert.Equal(["Newer", "Older"], page.Items.Select(a => a.Title));
        Assert.Equal("About it", page.Items[0].Description);
        Assert.Equal([AppMediaKinds.Image, AppMediaKinds.Video], page.Items[0].Media.Select(m => m.Kind));
        Assert.Equal((2, 9), (page.TotalCount, page.PageSize));
        Assert.Equal([newer.Id, older.Id], page.Items.Select(a => a.Id));
    }

    [Fact]
    public async Task An_app_is_updated_in_place_with_its_media_reordered()
    {
        var (a, b) = (await UploadAsync(), await UploadAsync());
        var app = await CreateAsync("App", a, b);

        var result = await UpdateApp.Handle(app.Id, new AppRequest("Renamed", "", [b, a]), _db, Files, _time, default);

        var updated = Assert.IsType<Ok<AppDetails>>(result.Result).Value!;
        Assert.Equal(("Renamed", app.CreatedAt), (updated.Title, updated.CreatedAt));
        Assert.Equal([b.Url, a.Url], updated.Media.Select(m => m.Url));
        Assert.IsType<NotFound>((await UpdateApp.Handle(999, new AppRequest("x", "", []), _db, Files, _time, default)).Result);
    }

    [Fact]
    public async Task Invalid_apps_are_rejected()
    {
        var result = await CreateApp.Handle(new AppRequest("", "", []), _db, Files, _alerts, Site, _time, default);

        Assert.Equal(["title"], Assert.IsType<ValidationProblem>(result.Result).ProblemDetails.Errors.Keys);
        Assert.Empty(_db.Apps);
    }

    [Fact]
    public async Task Deleting_an_app_frees_its_media_a_day_later()
    {
        var media = await UploadAsync();
        var app = await CreateAsync("App", media);
        _time.Advance(TimeSpan.FromDays(2));

        Assert.IsType<NoContent>((await DeleteApp.Handle(app.Id, _db, Files, _time, default)).Result);

        Assert.Empty(_db.Apps);
        Assert.Null(await Files.GetAsync(FileRules.FileIdIn(media.Url)!.Value, default));
        Assert.IsType<NotFound>((await DeleteApp.Handle(app.Id, _db, Files, _time, default)).Result);
    }

    [Fact]
    public async Task Saving_about_me_keeps_the_apps_media_and_saving_an_app_keeps_the_about_me_files()
    {
        var media = await UploadAsync();
        await CreateAsync("App", media);
        var photo = await Files.SaveAsync("photo.webp", "image/webp", [1], default);
        await UpdateAbout.Handle(AboutDefaults.Content with { PhotoUrl = FileRules.UrlFor(photo, "photo.webp") }, _db, Files, _time, default);
        _time.Advance(TimeSpan.FromDays(2));

        await UpdateAbout.Handle(AboutDefaults.Content with { PhotoUrl = FileRules.UrlFor(photo, "photo.webp") }, _db, Files, _time, default);
        await CreateAsync("Another");

        Assert.NotNull(await Files.GetAsync(FileRules.FileIdIn(media.Url)!.Value, default));
        Assert.NotNull(await Files.GetAsync(photo, default));
    }

    private async Task<IReadOnlyList<AppCategoryDto>> SaveCategoriesAsync(params AppCategoryRequest[] categories)
    {
        var result = await SaveAppCategories.Handle(categories, _db, default);
        return Assert.IsType<Ok<IReadOnlyList<AppCategoryDto>>>(result.Result).Value!;
    }

    [Fact]
    public async Task An_app_has_categories_platforms_and_links()
    {
        var categories = await SaveCategoriesAsync(new AppCategoryRequest(null, "Mobile app"), new AppCategoryRequest(null, "Video game"));
        var request = new AppRequest(" Game ", "", [], [categories[1].Id, categories[0].Id], [" iOS ", "Android"], [new AppLink(" Steam ", " https://store.steampowered.com/app/1 ")]);

        var created = Assert.IsType<Created<AppDetails>>((await CreateApp.Handle(request, _db, Files, _alerts, Site, _time, default)).Result).Value!;

        // In the categories' order, not the order chosen.
        Assert.Equal(["Mobile app", "Video game"], created.Categories.Select(c => c.Name));
        Assert.Equal(["iOS", "Android"], created.Platforms);
        Assert.Equal([new AppLink("Steam", "https://store.steampowered.com/app/1")], created.Links);
        Assert.Equal(created.Categories, (await ListApps.Handle(_db, default)).Value!.Items[0].Categories);
    }

    [Fact]
    public async Task An_unknown_category_is_rejected()
    {
        var result = await CreateApp.Handle(new AppRequest("App", "", [], [42]), _db, Files, _alerts, Site, _time, default);

        Assert.Equal(["categoryIds"], Assert.IsType<ValidationProblem>(result.Result).ProblemDetails.Errors.Keys);
    }

    [Fact]
    public async Task Categories_are_renamed_reordered_added_and_deleted_and_apps_lose_deleted_ones()
    {
        var first = await SaveCategoriesAsync(new AppCategoryRequest(null, "Mobile app"), new AppCategoryRequest(null, "Website"), new AppCategoryRequest(null, "Video game"));
        var (mobile, website, game) = (first[0], first[1], first[2]);
        var app = Assert.IsType<Created<AppDetails>>((await CreateApp.Handle(new AppRequest("App", "", [], [mobile.Id, website.Id]), _db, Files, _alerts, Site, _time, default)).Result).Value!;

        var saved = await SaveCategoriesAsync(new AppCategoryRequest(game.Id, "Game"), new AppCategoryRequest(mobile.Id, "Mobile app"), new AppCategoryRequest(null, "Desktop app"));

        Assert.Equal(["Game", "Mobile app", "Desktop app"], saved.Select(c => c.Name));
        Assert.Equal([game.Id, mobile.Id], saved.Take(2).Select(c => c.Id));
        var listed = (await ListApps.Handle(_db, default)).Value!.Items.Single(a => a.Id == app.Id);
        Assert.Equal(["Mobile app"], listed.Categories.Select(c => c.Name));
        Assert.Equal(saved, (await ListAppCategories.Handle(_db, default)).Value);
    }

    [Fact]
    public async Task An_invalid_category_list_changes_nothing()
    {
        await SaveCategoriesAsync(new AppCategoryRequest(null, "Website"));

        var result = await SaveAppCategories.Handle([new AppCategoryRequest(null, "")], _db, default);

        Assert.IsType<ValidationProblem>(result.Result);
        Assert.Equal(["Website"], (await ListAppCategories.Handle(_db, default)).Value!.Select(c => c.Name));
    }

    [Fact]
    public async Task A_youtube_link_is_stored_as_its_watch_link_and_other_links_as_they_are()
    {
        var request = new AppRequest("App", "", [new AppMedia("https://youtu.be/dQw4w9WgXcQ?si=x", AppMediaKinds.YouTube), new AppMedia(" https://cdn.example.com/a.png ", AppMediaKinds.Image)]);

        var created = Assert.IsType<Created<AppDetails>>((await CreateApp.Handle(request, _db, Files, _alerts, Site, _time, default)).Result).Value!;

        Assert.Equal(["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://cdn.example.com/a.png"], created.Media.Select(m => m.Url));
    }

    [Fact]
    public async Task A_new_app_asks_the_phone_whether_to_email_the_subscribers()
    {
        var app = await CreateAsync("Space Game");

        var announcement = await _db.Announcements.SingleAsync();
        Assert.Equal((UpdatesAnnouncer.AppKind, app.Id.ToString(), AnnouncementStatus.Pending), (announcement.Kind, announcement.ItemKey, announcement.Status));
        var alert = Assert.Single(_alerts.Sent);
        Assert.Equal("New app: Space Game", alert.Title);
        Assert.Equal(["Send email", "Ignore"], alert.Actions!.Select(a => a.Label));
        Assert.StartsWith($"https://jechel.dev/api/updates/announcements/{announcement.Id}/send?token=", alert.Actions![0].Url);
        var token = alert.Actions[0].Url.Split("token=")[1];
        Assert.True(AnnouncementDecisions.TokenMatches(announcement, token));
        Assert.False(AnnouncementDecisions.TokenMatches(announcement, "guess"));
    }
}
