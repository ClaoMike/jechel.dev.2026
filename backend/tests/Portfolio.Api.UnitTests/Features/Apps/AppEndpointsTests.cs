using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.About;
using Portfolio.Api.Features.Apps;
using Portfolio.Api.Features.Files;

namespace Portfolio.Api.UnitTests.Features.Apps;

public class AppEndpointsTests
{
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 11, 12, 0, 0, TimeSpan.Zero));
    private readonly PortfolioDbContext _db = new(new DbContextOptionsBuilder<PortfolioDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    private DatabaseFileStorage Files => new(_db, _time);

    private async Task<AppDetails> CreateAsync(string title, params AppMedia[] media)
    {
        var result = await AppEndpoints.CreateApp(new AppRequest($" {title} ", " About it ", media), _db, Files, _time, default);
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

        var page = (await AppEndpoints.ListApps(_db, default)).Value!;

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

        var result = await AppEndpoints.UpdateApp(app.Id, new AppRequest("Renamed", "", [b, a]), _db, Files, _time, default);

        var updated = Assert.IsType<Ok<AppDetails>>(result.Result).Value!;
        Assert.Equal(("Renamed", app.CreatedAt), (updated.Title, updated.CreatedAt));
        Assert.Equal([b.Url, a.Url], updated.Media.Select(m => m.Url));
        Assert.IsType<NotFound>((await AppEndpoints.UpdateApp(999, new AppRequest("x", "", []), _db, Files, _time, default)).Result);
    }

    [Fact]
    public async Task Invalid_apps_are_rejected()
    {
        var result = await AppEndpoints.CreateApp(new AppRequest("", "", []), _db, Files, _time, default);

        Assert.Equal(["title"], Assert.IsType<ValidationProblem>(result.Result).ProblemDetails.Errors.Keys);
        Assert.Empty(_db.Apps);
    }

    [Fact]
    public async Task Deleting_an_app_frees_its_media_a_day_later()
    {
        var media = await UploadAsync();
        var app = await CreateAsync("App", media);
        _time.Advance(TimeSpan.FromDays(2));

        Assert.IsType<NoContent>((await AppEndpoints.DeleteApp(app.Id, _db, Files, _time, default)).Result);

        Assert.Empty(_db.Apps);
        Assert.Null(await Files.GetAsync(FileRules.FileIdIn(media.Url)!.Value, default));
        Assert.IsType<NotFound>((await AppEndpoints.DeleteApp(app.Id, _db, Files, _time, default)).Result);
    }

    [Fact]
    public async Task Saving_about_me_keeps_the_apps_media_and_saving_an_app_keeps_the_about_me_files()
    {
        var media = await UploadAsync();
        await CreateAsync("App", media);
        var photo = await Files.SaveAsync("photo.webp", "image/webp", [1], default);
        await AboutEndpoints.UpdateAbout(AboutDefaults.Content with { PhotoUrl = FileRules.UrlFor(photo, "photo.webp") }, _db, Files, _time, default);
        _time.Advance(TimeSpan.FromDays(2));

        await AboutEndpoints.UpdateAbout(AboutDefaults.Content with { PhotoUrl = FileRules.UrlFor(photo, "photo.webp") }, _db, Files, _time, default);
        await CreateAsync("Another");

        Assert.NotNull(await Files.GetAsync(FileRules.FileIdIn(media.Url)!.Value, default));
        Assert.NotNull(await Files.GetAsync(photo, default));
    }
}
