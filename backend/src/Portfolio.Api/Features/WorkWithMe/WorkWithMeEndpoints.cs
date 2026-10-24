using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.WorkWithMe;

/// <summary>Work with me's hourly price: anyone can read it, only the admin can change it.</summary>
public static class WorkWithMeEndpoints
{
    public static IEndpointRouteBuilder MapWorkWithMeEndpoints(this IEndpointRouteBuilder app)
    {
        var workWithMe = app.MapGroup("/work-with-me");

        workWithMe.MapGet("/price", GetPrice).WithName("GetWorkWithMePrice");
        workWithMe.MapPut("/price", SavePrice).WithName("SaveWorkWithMePrice").RequireAuthorization();

        return app;
    }

    /// <summary>Public. The default (<see cref="WorkWithMePrices.Default"/>) until the admin first saves one.</summary>
    public static async Task<Ok<WorkWithMePriceDto>> GetPrice(PortfolioDbContext db, CancellationToken cancellationToken)
    {
        var price = await db.WorkWithMePrices
            .AsNoTracking()
            .Where(p => p.Id == WorkWithMePrice.SingletonId)
            .Select(p => new WorkWithMePriceDto(p.Currency, p.Amount))
            .FirstOrDefaultAsync(cancellationToken);

        return TypedResults.Ok(price ?? WorkWithMePrices.Default);
    }

    /// <summary>Admin only. Replaces the price and returns it as stored.</summary>
    public static async Task<Results<Ok<WorkWithMePriceDto>, ValidationProblem>> SavePrice(
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
