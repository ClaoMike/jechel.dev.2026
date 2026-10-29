using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Support.SupportShared;

namespace Portfolio.Api.Features.Support;

/// <summary>Admin only. Newest first.</summary>
public sealed class ListDonations : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/support").MapGet("/donations", Handle).WithName("ListDonations").RequireAuthorization();

    public static async Task<Ok<PagedResponse<DonationDto>>> Handle(
        PortfolioDbContext db,
        CancellationToken cancellationToken,
        int page = 1,
        int pageSize = DefaultPageSize)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var totalCount = await db.Donations.CountAsync(cancellationToken);
        var items = await db.Donations
            .AsNoTracking()
            .OrderByDescending(d => d.ReceivedAt)
            .ThenByDescending(d => d.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(d => new DonationDto(d.Id, d.Type, d.FromName, d.Message, d.Amount, d.Currency, d.Email, d.ReceivedAt, d.IsTest))
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(new PagedResponse<DonationDto>(items, page, pageSize, totalCount));
    }
}
