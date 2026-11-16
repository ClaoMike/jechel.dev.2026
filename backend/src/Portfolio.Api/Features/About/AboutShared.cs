using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.About;

public static class AboutShared
{
    /// <summary>The page as stored, or the placeholder content before the first save.</summary>
    public static async Task<AboutContent> LoadAsync(PortfolioDbContext db, CancellationToken cancellationToken)
    {
        var json = await db.AboutPages
            .AsNoTracking()
            .Where(p => p.Id == AboutPage.SingletonId)
            .Select(p => p.Content)
            .FirstOrDefaultAsync(cancellationToken);

        return json is null ? AboutDefaults.Content : AboutJson.Deserialize(json);
    }

}
