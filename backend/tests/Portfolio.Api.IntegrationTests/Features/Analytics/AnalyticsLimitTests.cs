using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Portfolio.Api.Features.Analytics;

namespace Portfolio.Api.IntegrationTests.Features.Analytics;

/// <summary>A script can't fill the database with made-up visits: each address gets so many batches per 10 minutes.</summary>
[Collection(ApiCollection.Name)]
public class AnalyticsLimitTests(PortfolioApiFactory factory)
{
    private const string Secret = "test-proxy-secret";

    /// <summary>Behind the proxy, which says who's asking, with a limit of 2 batches.</summary>
    private WebApplicationFactory<Program> WithLimit() =>
        factory.WithWebHostBuilder(builder => builder.UseSetting("Proxy:Secret", Secret).UseSetting("Analytics:LimitPer10Minutes", "2"));

    private static HttpRequestMessage Batch(string ip)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/analytics/events")
        {
            Content = JsonContent.Create(new CollectRequest(Guid.NewGuid(), null, [new EventInput(1, "pageview", "/", null, null, 0)])),
        };
        request.Headers.Add(ProxyHeaders.SecretHeader, Secret);
        request.Headers.Add(ProxyHeaders.HostHeader, "jechel.dev");
        request.Headers.Add(ProxyHeaders.ClientIpHeader, ip);
        request.Headers.UserAgent.ParseAdd("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36");
        return request;
    }

    [Fact]
    public async Task One_address_is_refused_after_its_limit_and_others_are_not_affected()
    {
        await using var api = WithLimit();
        var client = api.CreateClient();

        Assert.Equal(HttpStatusCode.NoContent, (await client.SendAsync(Batch("203.0.113.10"))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.SendAsync(Batch("203.0.113.10"))).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.SendAsync(Batch("203.0.113.10"))).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await client.SendAsync(Batch("203.0.113.11"))).StatusCode);
    }
}
