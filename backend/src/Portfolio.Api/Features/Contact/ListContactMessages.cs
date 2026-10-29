using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Contact.ContactShared;

namespace Portfolio.Api.Features.Contact;

/// <summary>The latest conversations first (by when anyone last wrote). Out-of-range pages return no items (with the real total).</summary>
public sealed class ListContactMessages : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/contact").MapGroup("/messages").RequireAuthorization().MapGet("/", Handle).WithName("ListContactMessages");

    public static async Task<Ok<PagedResponse<ContactMessageSummary>>> Handle(
        PortfolioDbContext db,
        CancellationToken cancellationToken,
        int page = 1,
        int pageSize = DefaultPageSize)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var totalCount = await db.ContactMessages.CountAsync(cancellationToken);
        var items = await db.ContactMessages
            .AsNoTracking()
            .OrderByDescending(m => m.LastActivityAt)
            .ThenByDescending(m => m.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(m => new ContactMessageSummary(m.Id, m.Name, m.ReceivedAt, m.ReadAt != null, m.LastActivityAt, 1 + db.ContactReplies.Count(r => r.MessageId == m.Id), m.Subject))
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(new PagedResponse<ContactMessageSummary>(items, page, pageSize, totalCount));
    }
}
