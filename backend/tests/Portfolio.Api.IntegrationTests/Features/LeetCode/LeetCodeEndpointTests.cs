using System.Net;
using System.Net.Http.Json;
using Portfolio.Api.Features.About;
using Portfolio.Api.Features.LeetCode;

namespace Portfolio.Api.IntegrationTests.Features.LeetCode;

[Collection(ApiCollection.Name)]
public class LeetCodeEndpointTests(PortfolioApiFactory factory)
{
    private async Task SaveUsernameAsync(string username)
    {
        var admin = factory.CreateBrowserClient();
        (await admin.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}")).EnsureSuccessStatusCode();
        var page = await admin.GetFromJsonAsync<AboutContent>("/api/about");
        (await admin.PutAsJsonAsync("/api/about", page! with { ProblemSolving = new ProblemSolving(username, [NeetCodeListIds.Blind75]) })).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Shows_the_stats_of_the_user_set_on_the_page_and_nothing_without_one()
    {
        await SaveUsernameAsync("");
        var none = await factory.CreateBrowserClient().GetAsync("/api/leetcode");
        Assert.Equal(HttpStatusCode.NoContent, none.StatusCode);

        await SaveUsernameAsync("NeetCode");
        var stats = await factory.CreateBrowserClient().GetFromJsonAsync<LeetCodeStats>("/api/leetcode");
        Assert.Equal(FakeLeetCodeClient.NeetCode.Solved, stats!.Solved);
        Assert.Equal(FakeLeetCodeClient.NeetCode.Total, stats.Total);

        await SaveUsernameAsync("nobody-at-all");
        var unknown = await factory.CreateBrowserClient().GetAsync("/api/leetcode");
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);

        await SaveUsernameAsync("");
    }
}
