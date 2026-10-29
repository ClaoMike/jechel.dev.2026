using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using static Portfolio.Api.Features.Analytics.AnalyticsShared;

namespace Portfolio.Api.Features.Analytics;

/// <summary>
/// Records a batch of a visit's events. Always 204, even when nothing is stored: the signed-in
/// admin, bots, events past the visit's limit, and events already stored (same sequence number).
/// </summary>
public sealed class CollectAnalyticsEvents : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/analytics").MapPost("/events", Handle).WithName("CollectAnalyticsEvents").RequireRateLimiting(RateLimitPolicy);

    public static async Task<Results<NoContent, ValidationProblem>> Handle(
        CollectRequest request,
        HttpContext http,
        PortfolioDbContext db,
        VisitorHasher visitors,
        TimeProvider time,
        IPhoneAlerts alerts,
        CancellationToken cancellationToken)
    {
        if (request.SessionId == Guid.Empty)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["sessionId"] = ["A session id is required."] });
        }

        // The admin's own browsing would only skew the numbers.
        if (http.User.Identity?.IsAuthenticated == true) return TypedResults.NoContent();

        var userAgent = http.Request.Headers.UserAgent.ToString();
        var agent = AnalyticsRules.ParseUserAgent(userAgent);
        if (agent.IsBot) return TypedResults.NoContent();

        var now = time.GetUtcNow();
        var events = (request.Events ?? [])
            .Take(AnalyticsRules.MaxEventsPerBatch)
            .Where(e => e.Seq > 0 && e.Type is not null && AnalyticsRules.EventTypes.Contains(e.Type))
            .DistinctBy(e => e.Seq)
            .Select(e => (Input: e, OccurredAt: OccurredAt(e, now)))
            .ToList();

        // Two batches of a new visit can arrive together (a timed send and the one sent as the tab
        // closes): the second insert of the visit fails, so it's tried once more against the stored one.
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                var errors = await StoreAsync(request, events, http, agent, userAgent, db, visitors, now, cancellationToken);
                // Once stored, so a retried batch doesn't ring twice; throttled, so a crash every visitor hits rings once an hour.
                foreach (var (label, path) in errors)
                {
                    alerts.SendThrottled($"web:{label}", new PhoneAlert(AlertKinds.SiteError, "Site error", $"{label}\non {path} ({agent.Browser}, {agent.Device})", "/engagement", AlertPriority.Default, "warning"));
                }
                return TypedResults.NoContent();
            }
            catch (DbUpdateException) when (attempt == 1)
            {
                db.ChangeTracker.Clear();
            }
        }
    }
}
