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
            [new AppMedia("https://elsewhere.example/x.png", "image"), new AppMedia(Upload, "audio"), null]);

        Assert.Equal(["description", "media[0].url", "media[1].kind", "media[2].url", "title"], AppRules.Validate(request).Keys.Order());
    }

    [Fact]
    public void Limits_are_checked()
    {
        var errors = AppRules.Validate(new AppRequest(new string('t', AppRules.TitleMaxLength + 1), new string('d', AppRules.DescriptionMaxLength + 1), [.. Enumerable.Repeat(new AppMedia(Upload, "image"), AppRules.MaxMedia + 1)]));

        Assert.Equal(["description", "media", "title"], errors.Keys.Order());
        Assert.Contains("media", AppRules.Validate(new AppRequest("x", "", null)).Keys);
    }
}
