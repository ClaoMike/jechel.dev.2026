using Microsoft.AspNetCore.Http;
using Portfolio.Api.Features.Auth;

namespace Portfolio.Api.UnitTests.Features.Auth;

public class SameOriginWritesTests
{
    private static HttpRequest Request(string scheme, string host)
    {
        var http = new DefaultHttpContext();
        http.Request.Scheme = scheme;
        http.Request.Host = new HostString(host);
        return http.Request;
    }

    [Theory]
    [InlineData("https://jechel.dev", "https", "jechel.dev", true)]
    [InlineData("https://JECHEL.dev", "https", "jechel.dev", true)]
    [InlineData("http://localhost:5173", "http", "localhost:5173", true)]
    [InlineData("https://jechel.dev:443", "https", "jechel.dev", true)]
    [InlineData("http://jechel.dev", "https", "jechel.dev", false)]
    [InlineData("https://evil.example", "https", "jechel.dev", false)]
    [InlineData("https://admin.jechel.dev", "https", "jechel.dev", false)]
    [InlineData("https://jechel.dev.evil.example", "https", "jechel.dev", false)]
    [InlineData("http://localhost:5174", "http", "localhost:5173", false)]
    [InlineData("null", "https", "jechel.dev", false)]
    public void Only_the_sites_own_scheme_and_host_count_as_the_same_origin(string origin, string scheme, string host, bool same) =>
        Assert.Equal(same, SameOriginWrites.IsSameOrigin(origin, Request(scheme, host)));
}
