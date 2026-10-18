using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;
using Microsoft.Extensions.DependencyInjection;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;

namespace Portfolio.Api.UnitTests;

/// <summary>What SiteEndpoints.LoadAsync needs: the database (in memory), the site options and a HybridCache.</summary>
public static class TestSite
{
    public static ServiceProvider Services(bool visibleByDefault = true, string? database = null)
    {
        var name = database ?? Guid.NewGuid().ToString();
        return new ServiceCollection()
            .AddDbContext<PortfolioDbContext>(o => o.UseInMemoryDatabase(name))
            .Configure<SiteOptions>(o => o.PagesVisibleByDefault = visibleByDefault)
            .AddHybridCache().Services
            .BuildServiceProvider();
    }

    public static HybridCache Cache(this IServiceProvider services) => services.GetRequiredService<HybridCache>();
}
