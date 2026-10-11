using Portfolio.Api.Features.Apps;
using Portfolio.Api.Features.Files;

namespace Portfolio.Api.UnitTests.Features.Apps;

public class AppRulesTests
{
    private static readonly string Upload = FileRules.UrlFor(Guid.NewGuid(), "image.webp");

    [Fact]
    public void A_title_is_enough()
    {
        Assert.Empty(AppRules.Validate(new AppRequest("Portfolio", null, [])));
        Assert.Empty(AppRules.Validate(new AppRequest("Portfolio", "See [the code](https://github.com/x)", [new AppMedia(Upload, "image"), new AppMedia(Upload, "video")])));
    }

    [Fact]
    public void Errors_point_at_the_field_that_is_wrong()
    {
        var request = new AppRequest(
            " ",
            "[Click](javascript:alert(1))",
            [new AppMedia("/not/an/upload.png", "image"), new AppMedia(Upload, "audio"), null]);

        Assert.Equal(["description", "media[0].url", "media[1].kind", "media[2].url", "title"], AppRules.Validate(request).Keys.Order());
    }

    [Fact]
    public void Limits_are_checked()
    {
        var errors = AppRules.Validate(new AppRequest(new string('t', AppRules.TitleMaxLength + 1), new string('d', AppRules.DescriptionMaxLength + 1), [.. Enumerable.Repeat(new AppMedia(Upload, "image"), AppRules.MaxMedia + 1)]));

        Assert.Equal(["description", "media", "title"], errors.Keys.Order());
        Assert.Contains("media", AppRules.Validate(new AppRequest("x", "", null)).Keys);
    }

    [Fact]
    public void Categories_platforms_and_links_are_checked()
    {
        var request = new AppRequest("App", "", [],
            CategoryIds: [1, 1],
            Platforms: ["iOS", "ios"],
            Links: [new AppLink("App Store", "https://apps.apple.com/app/x"), new AppLink("", "javascript:alert(1)"), new AppLink("Site", "/relative")]);

        Assert.Equal(["categoryIds", "links[1].label", "links[1].url", "links[2].url", "platforms"], AppRules.Validate(request).Keys.Order());
    }

    [Fact]
    public void Categories_must_still_exist()
    {
        var request = new AppRequest("App", "", [], CategoryIds: [1, 7]);

        Assert.Empty(AppRules.Validate(request));
        Assert.Equal(["categoryIds"], AppRules.Validate(request, [1, 2]).Keys);
    }

    [Fact]
    public void A_category_list_needs_unique_names_and_known_ids()
    {
        AppCategoryRequest?[] categories = [new(1, "Mobile app"), new(null, " mobile APP "), new(null, ""), new(9, "Game")];

        Assert.Equal(["[1].name", "[2].name", "[3].id"], AppRules.ValidateCategories(categories, [1, 2]).Keys.Order());
        Assert.Empty(AppRules.ValidateCategories([new(2, "Website"), new(null, "Desktop app")], [1, 2]));
    }

    [Fact]
    public void Media_can_be_links_to_images_videos_elsewhere_or_youtube()
    {
        var request = new AppRequest("App", "", [
            new AppMedia("https://cdn.example.com/shot.png", "image"),
            new AppMedia("https://cdn.example.com/trailer.mp4", "video"),
            new AppMedia("https://youtu.be/dQw4w9WgXcQ", "youtube"),
            new AppMedia("https://cdn.example.com/trailer.mp4", "youtube"),
            new AppMedia("javascript:alert(1)", "image"),
        ]);

        Assert.Equal(["media[3].url", "media[4].url"], AppRules.Validate(request).Keys.Order());
    }
}
