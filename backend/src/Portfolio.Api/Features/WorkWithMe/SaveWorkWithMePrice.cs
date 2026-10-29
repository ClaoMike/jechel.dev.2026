using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.WorkWithMe;

/// <summary>Admin only. Replaces the price and returns it as stored.</summary>
public sealed class SaveWorkWithMePrice : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/work-with-me").MapPut("/price", Handle).WithName("SaveWorkWithMePrice").RequireAuthorization();

    public static async Task<Results<Ok<WorkWithMePriceDto>, ValidationProblem>> Handle(
        SaveWorkWithMePriceRequest request,
        PortfolioDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var errors = WorkWithMePrices.Validate(request);
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var price = await db.WorkWithMePrices.FindAsync([WorkWithMePrice.SingletonId], cancellationToken);
        if (price is null)
        {
            price = new WorkWithMePrice { Id = WorkWithMePrice.SingletonId, Currency = "" };
            db.WorkWithMePrices.Add(price);
        }
        price.Currency = request.Currency!;
        price.Amount = request.Amount!.Value;
        price.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.Ok(new WorkWithMePriceDto(price.Currency, price.Amount));
    }
}
