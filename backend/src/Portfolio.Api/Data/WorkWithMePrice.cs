namespace Portfolio.Api.Data;

/// <summary>Work with me's hourly price, as the admin set it. One row; until the admin first saves one, the default (Features.WorkWithMe.WorkWithMePrices.Default).</summary>
public class WorkWithMePrice
{
    public const int SingletonId = 1;

    public int Id { get; set; }

    /// <summary>An ISO 4217 code from Features.WorkWithMe.WorkWithMePrices.Currencies, e.g. "EUR".</summary>
    public required string Currency { get; set; }

    /// <summary>An hour's price, up to two decimals.</summary>
    public decimal Amount { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
