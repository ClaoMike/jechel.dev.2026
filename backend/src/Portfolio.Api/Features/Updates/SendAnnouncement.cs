using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Updates.UpdatesShared;

namespace Portfolio.Api.Features.Updates;

public sealed class SendAnnouncement : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/updates").MapPost("/announcements/{id:int}/send", (int id, string? token, HttpContext http, PortfolioDbContext db, UpdatesTrigger trigger, CancellationToken ct) =>
            Decide(id, token, AnnouncementStatus.Approved, http, db, trigger, ct)).WithName("SendAnnouncement");
}
