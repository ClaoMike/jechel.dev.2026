using Portfolio.Api.Features.About;
using Portfolio.Api.Features.Apps;
using Portfolio.Api.Features.Files;

namespace Portfolio.Api.UnitTests.Features.Apps;

/// <summary>Every rule of an app and of the category list, at its limits, with the message the admin sees.</summary>
public class AppRulesLimitsTests
{
    private static readonly string Upload = FileRules.UrlFor(Guid.NewGuid(), "image.webp");

    private static string Error(AppRequest request, string key) => Assert.Single(AppRules.Validate(request)[key]);

    private static AppRequest App(string? title = "App", string? description = "", IReadOnlyList<AppMedia?>? media = null, IReadOnlyList<int>? categories = null, IReadOnlyList<string?>? platforms = null, IReadOnlyList<AppLink?>? links = null) =>
        new(title, description, media ?? [], categories, platforms, links);

    [Fact]
    public void An_app_is_required() =>
        Assert.Equal("The app is required.", Assert.Single(AppRules.Validate(null)[""]));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void A_title_is_required(string? title) => Assert.Equal("Required.", Error(App(title), "title"));

    [Fact]
    public void A_title_fits_120_characters_once_trimmed()
    {
        Assert.Empty(AppRules.Validate(App($"  {new string('t', AppRules.TitleMaxLength)}  ")));
        Assert.Equal("Must be at most 120 characters.", Error(App(new string('t', AppRules.TitleMaxLength + 1)), "title"));
    }

    [Fact]
    public void A_description_fits_5000_characters_and_is_optional()
    {
        Assert.Empty(AppRules.Validate(App(description: null)));
        Assert.Empty(AppRules.Validate(App(description: new string('d', AppRules.DescriptionMaxLength))));
        Assert.Equal("Must be at most 5000 characters.", Error(App(description: new string('d', AppRules.DescriptionMaxLength + 1)), "description"));
    }

    [Theory]
    [InlineData("See [the store](https://example.com) or [contact me](/contact).", true)]
    [InlineData("[x](javascript:alert(1))", false)]
    [InlineData("[x](//evil.example)", false)]
    [InlineData("[x](ftp://example.com/file)", false)]
    public void Links_in_a_description_are_http_links_or_paths_on_the_site(string description, bool ok)
    {
        if (ok) Assert.Empty(AppRules.Validate(App(description: description)));
        else Assert.Equal("Links must be http(s) links, or paths on this site starting with /.", Error(App(description: description), "description"));
    }

    [Fact]
    public void Media_are_required_as_a_list_of_up_to_30()
    {
        Assert.Equal("Required (can be empty).", Error(new AppRequest("App", "", null), "media"));
        Assert.Empty(AppRules.Validate(App(media: [.. Enumerable.Repeat(new AppMedia(Upload, "image"), AppRules.MaxMedia)])));
        Assert.Equal("At most 30 images and videos.", Error(App(media: [.. Enumerable.Repeat(new AppMedia(Upload, "image"), AppRules.MaxMedia + 1)]), "media"));
    }

    [Theory]
    [InlineData("image")]
    [InlineData("video")]
    public void An_image_or_video_is_an_upload_or_an_http_link_elsewhere(string kind)
    {
        Assert.Empty(AppRules.Validate(App(media: [new AppMedia(Upload, kind), new AppMedia("https://cdn.example.com/x", kind), new AppMedia(" http://cdn.example.com/x ", kind)])));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("/not/an/upload.png")]
    [InlineData("//cdn.example.com/x.png")]
    [InlineData("ftp://cdn.example.com/x.png")]
    [InlineData("data:image/png;base64,AAAA")]
    public void Anything_else_is_not_an_image_or_video(string url) =>
        Assert.Equal("Must be an uploaded file or an http(s) link.", Error(App(media: [new AppMedia(url, "image")]), "media[0].url"));

    [Fact]
    public void A_link_elsewhere_fits_the_link_length()
    {
        var longest = "https://cdn.example.com/" + new string('a', AboutRules.UrlMaxLength - "https://cdn.example.com/".Length);
        Assert.Empty(AppRules.Validate(App(media: [new AppMedia(longest, "image")])));
        Assert.Equal("Must be an uploaded file or an http(s) link.", Error(App(media: [new AppMedia(longest + "a", "image")]), "media[0].url"));
    }

    [Fact]
    public void A_YouTube_item_needs_a_YouTube_video_link()
    {
        Assert.Empty(AppRules.Validate(App(media: [new AppMedia("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube")])));
        Assert.Equal("Must be a YouTube video link.", Error(App(media: [new AppMedia(Upload, "youtube")]), "media[0].url"));
    }

    [Theory]
    [InlineData("audio")]
    [InlineData("Image")]
    [InlineData("")]
    public void An_item_is_an_image_a_video_or_YouTube(string kind) =>
        Assert.Equal("Must be image, video or youtube.", Error(App(media: [new AppMedia(Upload, kind)]), "media[0].kind"));

    [Fact]
    public void A_missing_item_says_so() => Assert.Equal("Required.", Error(App(media: [null]), "media[0].url"));

    [Fact]
    public void Categories_are_optional_each_once_and_must_exist()
    {
        Assert.Empty(AppRules.Validate(App(categories: null), [1]));
        Assert.Empty(AppRules.Validate(App(categories: [1, 2]), [1, 2]));
        Assert.Equal("Each category can be chosen once.", Error(App(categories: [2, 2]), "categoryIds"));
        Assert.Equal("That category doesn't exist any more. Reload the page.", Assert.Single(AppRules.Validate(App(categories: [3]), [1, 2])["categoryIds"]));
    }

    [Fact]
    public void Platforms_are_up_to_20_names_of_1_to_40_characters_each_once()
    {
        Assert.Empty(AppRules.Validate(App(platforms: [.. Enumerable.Range(1, AppRules.MaxPlatforms).Select(i => $"P{i}")])));
        Assert.Equal("At most 20.", Error(App(platforms: [.. Enumerable.Range(1, AppRules.MaxPlatforms + 1).Select(i => $"P{i}")]), "platforms"));
        Assert.Empty(AppRules.Validate(App(platforms: [new string('p', AppRules.PlatformMaxLength)])));
        foreach (var bad in new[] { "", "  ", null, new string('p', AppRules.PlatformMaxLength + 1) })
        {
            Assert.Equal("Each must be 1 to 40 characters.", Error(App(platforms: [bad]), "platforms"));
        }
        Assert.Equal("Each can be added once.", Error(App(platforms: ["iOS", " IOS "]), "platforms"));
    }

    [Fact]
    public void Links_are_up_to_10()
    {
        var link = new AppLink("Store", "https://example.com");
        Assert.Empty(AppRules.Validate(App(links: [.. Enumerable.Repeat(link, AppRules.MaxLinks)])));
        Assert.Equal("At most 10 links.", Error(App(links: [.. Enumerable.Repeat(link, AppRules.MaxLinks + 1)]), "links"));
    }

    [Fact]
    public void A_link_has_a_label_of_up_to_40_characters()
    {
        Assert.Empty(AppRules.Validate(App(links: [new AppLink(new string('l', AppRules.LinkLabelMaxLength), "https://example.com")])));
        Assert.Equal("Required, e.g. App Store.", Error(App(links: [new AppLink("  ", "https://example.com")]), "links[0].label"));
        Assert.Equal("Must be at most 40 characters.", Error(App(links: [new AppLink(new string('l', AppRules.LinkLabelMaxLength + 1), "https://example.com")]), "links[0].label"));
    }

    [Theory]
    [InlineData("https://apps.apple.com/app/id1", null)]
    [InlineData("http://store.example.com", null)]
    [InlineData("", "Required.")]
    [InlineData("/apps", "Must be an http(s) link, e.g. https://apps.apple.com/….")]
    [InlineData("javascript:alert(1)", "Must be an http(s) link, e.g. https://apps.apple.com/….")]
    [InlineData("mailto:me@example.com", "Must be an http(s) link, e.g. https://apps.apple.com/….")]
    public void A_links_address_is_an_http_link_elsewhere(string url, string? error)
    {
        var errors = AppRules.Validate(App(links: [new AppLink("Store", url)]));
        if (error is null) Assert.Empty(errors);
        else Assert.Equal(error, Assert.Single(errors["links[0].url"]));
    }

    [Fact]
    public void A_links_address_fits_the_link_length() =>
        Assert.Equal("Must be an http(s) link, e.g. https://apps.apple.com/….", Error(App(links: [new AppLink("Store", "https://example.com/" + new string('a', AboutRules.UrlMaxLength))]), "links[0].url"));

    [Fact]
    public void A_missing_link_needs_both_its_parts()
    {
        var errors = AppRules.Validate(App(links: [null]));
        Assert.Equal(["links[0].label", "links[0].url"], errors.Keys.Order());
    }

    [Fact]
    public void The_category_list_is_required_and_up_to_30()
    {
        Assert.Equal("The categories are required.", Assert.Single(AppRules.ValidateCategories(null, [])[""]));
        Assert.Empty(AppRules.ValidateCategories([.. Enumerable.Range(1, AppRules.MaxCategories).Select(i => new AppCategoryRequest(null, $"C{i}"))], []));
        Assert.Equal("At most 30 categories.", Assert.Single(AppRules.ValidateCategories([.. Enumerable.Range(1, AppRules.MaxCategories + 1).Select(i => new AppCategoryRequest(null, $"C{i}"))], [])[""]));
    }

    [Fact]
    public void A_category_name_is_1_to_40_characters()
    {
        Assert.Empty(AppRules.ValidateCategories([new(null, new string('c', AppRules.CategoryNameMaxLength))], []));
        Assert.Equal("Must be at most 40 characters.", Assert.Single(AppRules.ValidateCategories([new(null, new string('c', AppRules.CategoryNameMaxLength + 1))], [])["[0].name"]));
        Assert.Equal("Required.", Assert.Single(AppRules.ValidateCategories([null], [])["[0].name"]));
    }

    [Fact]
    public void A_category_is_listed_once()
    {
        var errors = AppRules.ValidateCategories([new(1, "Mobile app"), new(1, "Website")], [1]);
        Assert.Equal("A category is listed twice.", Assert.Single(errors[""]));
    }
}
