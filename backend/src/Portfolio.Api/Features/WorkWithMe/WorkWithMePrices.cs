namespace Portfolio.Api.Features.WorkWithMe;

/// <summary>An hour's price: a currency (ISO 4217) and an amount in it.</summary>
public record WorkWithMePriceDto(string Currency, decimal Amount);

/// <param name="Currency">Required: one of <see cref="WorkWithMePrices.Currencies"/>.</param>
/// <param name="Amount">Required: more than 0, at most <see cref="WorkWithMePrices.MaxAmount"/>, up to two decimals.</param>
public record SaveWorkWithMePriceRequest(string? Currency, decimal? Amount);

/// <summary>The currencies the price can be in, and what makes a price.</summary>
public static class WorkWithMePrices
{
    /// <summary>
    /// The ones the admin can pick: the favourites, then the other currencies of the EU's countries (the frontend's
    /// features/workWithMe/currencies.ts lists the same, with their symbols and flags).
    /// </summary>
    public static readonly IReadOnlyList<string> Currencies = ["EUR", "RON", "GBP", "CZK", "DKK", "HUF", "PLN", "SEK"];

    public const decimal MaxAmount = 100_000m;

    /// <summary>Until the admin first saves one: €25 an hour.</summary>
    public static readonly WorkWithMePriceDto Default = new("EUR", 25m);

    /// <summary>What's wrong with it, by field; empty when it can be saved.</summary>
    public static Dictionary<string, string[]> Validate(SaveWorkWithMePriceRequest? request)
    {
        var errors = new Dictionary<string, string[]>();
        if (request?.Currency is not { } currency || !Currencies.Contains(currency))
        {
            errors["currency"] = [$"Pick one of: {string.Join(", ", Currencies)}."];
        }
        if (request?.Amount is not { } amount || amount <= 0 || amount > MaxAmount)
        {
            errors["amount"] = [$"Give an amount more than 0 and at most {MaxAmount:0}."];
        }
        else if (decimal.Round(amount, 2) != amount)
        {
            errors["amount"] = ["Give the amount with at most two decimals."];
        }
        return errors;
    }
}
