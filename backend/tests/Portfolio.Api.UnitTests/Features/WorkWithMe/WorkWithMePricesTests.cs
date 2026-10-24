using Portfolio.Api.Features.WorkWithMe;

namespace Portfolio.Api.UnitTests.Features.WorkWithMe;

public class WorkWithMePricesTests
{
    [Theory]
    [InlineData("EUR", "25")]
    [InlineData("RON", "120.50")]
    [InlineData("GBP", "0.01")]
    [InlineData("AUD", "100000")]
    public void A_listed_currency_and_an_amount_above_0_with_up_to_two_decimals_can_be_saved(string currency, string amount)
    {
        Assert.Empty(WorkWithMePrices.Validate(new SaveWorkWithMePriceRequest(currency, decimal.Parse(amount))));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("eur")]
    [InlineData("XYZ")]
    [InlineData("BTC")]
    public void A_currency_not_on_the_list_is_refused(string? currency)
    {
        var errors = WorkWithMePrices.Validate(new SaveWorkWithMePriceRequest(currency, 25m));

        Assert.Equal(["currency"], errors.Keys);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("0")]
    [InlineData("-5")]
    [InlineData("100000.01")]
    [InlineData("25.005")]
    public void An_amount_missing_not_above_0_too_big_or_with_more_than_two_decimals_is_refused(string? amount)
    {
        var errors = WorkWithMePrices.Validate(new SaveWorkWithMePriceRequest("EUR", amount is null ? null : decimal.Parse(amount)));

        Assert.Equal(["amount"], errors.Keys);
    }

    [Fact]
    public void No_body_at_all_is_refused_for_both()
    {
        Assert.Equal(["currency", "amount"], WorkWithMePrices.Validate(null).Keys);
    }

    [Fact]
    public void Starts_at_25_euros_and_its_currency_is_on_the_list_with_the_favourites_first()
    {
        Assert.Equal(new WorkWithMePriceDto("EUR", 25m), WorkWithMePrices.Default);
        Assert.Equal(["EUR", "RON", "GBP"], WorkWithMePrices.Currencies.Take(3));
        Assert.Equal(WorkWithMePrices.Currencies.Count, WorkWithMePrices.Currencies.Distinct().Count());
    }
}
