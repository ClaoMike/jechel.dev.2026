using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.WorkWithMe;

/// <summary>Public. The default (<see cref="WorkWithMePrices.Default"/>) until the admin first saves one.</summary>
public sealed class GetWorkWithMePrice : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/work-with-me").MapGet("/price", Handle).WithName("GetWorkWithMePrice");

    public static async Task<Ok<WorkWithMePriceDto>> Handle(PortfolioDbContext db, CancellationToken cancellationToken)
    {
        var price = await db.WorkWithMePrices
            .AsNoTracking()
            .Where(p => p.Id == WorkWithMePrice.SingletonId)
            .Select(p => new WorkWithMePriceDto(p.Currency, p.Amount))
            .FirstOrDefaultAsync(cancellationToken);

        return TypedResults.Ok(price ?? WorkWithMePrices.Default);
    }
}
