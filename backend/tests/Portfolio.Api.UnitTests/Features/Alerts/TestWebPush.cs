using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Portfolio.Api.Features.Alerts;

namespace Portfolio.Api.UnitTests.Features.Alerts;

/// <summary>The site's own notifications for tests, posting through <paramref name="handler"/> (none given: a test that never gets that far).</summary>
public static class TestWebPush
{
    public static WebPushSender Sender(IServiceScopeFactory scopes, TimeProvider time, HttpMessageHandler? handler = null, string publicUrl = "https://jechel.dev") =>
        new(new Clients(handler ?? new Unreachable()), scopes, Options.Create(new SiteOptions { PublicUrl = publicUrl }), time, NullLogger<WebPushSender>.Instance);

    private sealed class Clients(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class Unreachable : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            throw new InvalidOperationException($"No push service in this test: {request.RequestUri}");
    }
}
