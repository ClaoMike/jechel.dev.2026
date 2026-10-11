using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Portfolio.Api.IntegrationTests;

/// <summary>
/// The API on a real Kestrel server (a random port) instead of the in-memory test server, for
/// what only a real server enforces, like its 30 MB default request size limit.
/// </summary>
public class KestrelApiFactory : PortfolioApiFactory
{
    public KestrelApiFactory() => UseKestrel(0);

    /// <summary>Like <see cref="PortfolioApiFactory.CreateBrowserClient"/>, but over the network to the real server.</summary>
    public HttpClient CreateKestrelClient()
    {
        StartServer();
        var address = Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First();
        var client = CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, BaseAddress = new Uri(address) });
        client.Timeout = TimeSpan.FromMinutes(2);
        return client;
    }
}

[CollectionDefinition(Name)]
public class KestrelApiCollection : ICollectionFixture<KestrelApiFactory>
{
    public const string Name = "Kestrel API";
}
