using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Portfolio.Api.Features.About;

namespace Portfolio.Api.IntegrationTests.Features.About;

[Collection(ApiCollection.Name)]
public class AboutEndpointTests(PortfolioApiFactory factory)
{
    private async Task<HttpClient> SignedInClientAsync()
    {
        var client = factory.CreateBrowserClient();
        var response = await client.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}");
        response.EnsureSuccessStatusCode();
        return client;
    }

    [Fact]
    public async Task Anyone_can_read_the_page()
    {
        var response = await factory.CreateBrowserClient().GetAsync("/api/about");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var content = await response.Content.ReadFromJsonAsync<AboutContent>();
        Assert.NotNull(content!.Links);
    }

    [Fact]
    public async Task Only_the_admin_can_change_it()
    {
        var response = await factory.CreateBrowserClient().PutAsJsonAsync("/api/about", AboutDefaults.Content);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task The_admin_saves_the_page_and_everyone_sees_it_in_the_order_saved()
    {
        var admin = await SignedInClientAsync();
        var marker = $"Engineer {Guid.NewGuid():N}";
        var content = AboutDefaults.Content with
        {
            Experience =
            [
                new ExperienceItem("Older", "[Co](https://co.example)", "", new DateOnly(2010, 1, 1), new DateOnly(2012, 1, 1), ["Did a thing"]),
                new ExperienceItem(marker, "Co", "Remote", new DateOnly(2031, 2, 1), null, []),
            ],
        };

        var put = await admin.PutAsJsonAsync("/api/about", content);
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);

        var page = await factory.CreateBrowserClient().GetFromJsonAsync<AboutContent>("/api/about");
        Assert.Equal(["Older", marker], page!.Experience.Select(e => e.Title));
        Assert.Null(page.Experience[1].End);
        Assert.Equal(["Did a thing"], page.Experience[0].Bullets);
        Assert.Equal("[Co](https://co.example)", page.Experience[0].Company);
        Assert.Equal(AboutDefaults.Content.Places.Select(p => p.Name), page.Places.Select(p => p.Name));
        Assert.Equal(AboutDefaults.Colors.Skills, page.Colors.Skills);
    }

    [Fact]
    public async Task Invalid_content_returns_field_errors()
    {
        var admin = await SignedInClientAsync();

        var response = await admin.PutAsJsonAsync("/api/about", AboutDefaults.Content with { Skills = [new Skill("", [new SkillPeriod(new DateOnly(2020, 1, 1), null, ["hobby"])])] });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
        Assert.Equal(["skills[0].name", "skills[0].periods[0].uses"], problem!.Errors.Keys.Order());
    }
}
