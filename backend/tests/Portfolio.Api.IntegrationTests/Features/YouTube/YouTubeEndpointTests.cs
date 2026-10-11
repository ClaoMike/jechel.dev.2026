using System.Net.Http.Json;
using Portfolio.Api.Features.YouTube;

namespace Portfolio.Api.IntegrationTests.Features.YouTube;

[Collection(ApiCollection.Name)]
public class YouTubeEndpointTests(PortfolioApiFactory factory)
{
    [Fact]
    public async Task Anyone_pages_through_the_videos_nine_at_a_time()
    {
        var client = factory.CreateBrowserClient();

        var first = await client.GetFromJsonAsync<PagedResponse<YouTubeVideo>>("/api/youtube/videos");
        var second = await client.GetFromJsonAsync<PagedResponse<YouTubeVideo>>("/api/youtube/videos?page=2");

        Assert.Equal(11, first!.TotalCount);
        Assert.Equal(9, first.Items.Count);
        Assert.Equal(["v10", "v11"], second!.Items.Select(v => v.Id));
        Assert.Contains("\"url\":\"https://www.youtube.com/watch?v=v1\"", await client.GetStringAsync("/api/youtube/videos?pageSize=1"));
    }
}
