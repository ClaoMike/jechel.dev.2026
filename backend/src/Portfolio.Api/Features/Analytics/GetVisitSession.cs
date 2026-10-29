using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Analytics.AnalyticsShared;

namespace Portfolio.Api.Features.Analytics;

/// <summary>The visit with every event in order: what's needed to reproduce what happened.</summary>
public sealed class GetVisitSession : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/analytics").MapGroup("/sessions").RequireAuthorization().MapGet("/{id:guid}", Handle).WithName("GetVisitSession");

    public static async Task<Results<Ok<SessionDetails>, NotFound>> Handle(
        Guid id,
        PortfolioDbContext db,
        CancellationToken cancellationToken)
    {
        var s = await db.VisitSessions.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id, cancellationToken);
        if (s is null) return TypedResults.NotFound();

        var events = await db.VisitEvents
            .AsNoTracking()
            .Where(e => e.SessionId == id)
            .OrderBy(e => e.Sequence)
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(new SessionDetails(
            s.Id, s.StartedAt, s.LastSeenAt, s.EntryPath, s.Referrer, s.UtmSource, s.UtmMedium, s.UtmCampaign,
            s.UserAgent, s.Device, s.Browser, s.OperatingSystem, s.Country, s.Language, s.TimeZone,
            s.ScreenWidth, s.ScreenHeight, s.ViewportWidth, s.ViewportHeight, s.Theme, s.LastTheme,
            [.. events.Select(e => new SessionEvent(
                e.Sequence,
                e.OccurredAt,
                e.Type,
                e.Path,
                e.Label,
                e.Detail is null ? null : JsonSerializer.Deserialize<Dictionary<string, string>>(e.Detail, Json)))]));
    }
}
