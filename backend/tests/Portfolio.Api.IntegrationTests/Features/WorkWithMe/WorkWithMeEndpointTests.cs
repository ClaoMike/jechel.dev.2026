using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Portfolio.Api.Data;
using Portfolio.Api.Features.WorkWithMe;

namespace Portfolio.Api.IntegrationTests.Features.WorkWithMe;

/// <summary>Work with me's price through the real pipeline and PostgreSQL. Each test removes the price it saved.</summary>
[Collection(ApiCollection.Name)]
public class WorkWithMeEndpointTests(PortfolioApiFactory factory) : IAsyncLifetime
{
    public Task InitializeAsync() => ForgetPriceAsync();

    public Task DisposeAsync() => ForgetPriceAsync();

    private async Task ForgetPriceAsync()
    {
        using var scope = factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<PortfolioDbContext>().WorkWithMePrices.ExecuteDeleteAsync();
    }

    private async Task<HttpClient> AdminAsync()
    {
        var client = factory.CreateBrowserClient();
        (await client.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}")).EnsureSuccessStatusCode();
        return client;
    }

    [Fact]
    public async Task Anyone_can_read_the_price_which_starts_at_25_euros()
    {
        var price = await factory.CreateBrowserClient().GetFromJsonAsync<WorkWithMePriceDto>("/api/work-with-me/price");

        Assert.Equal(new WorkWithMePriceDto("EUR", 25m), price);
    }

    [Fact]
    public async Task Only_the_admin_can_change_it()
    {
        var response = await factory.CreateBrowserClient().PutAsJsonAsync("/api/work-with-me/price", new { currency = "GBP", amount = 1 });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(new WorkWithMePriceDto("EUR", 25m), await factory.CreateBrowserClient().GetFromJsonAsync<WorkWithMePriceDto>("/api/work-with-me/price"));
    }

    [Fact]
    public async Task The_admin_s_price_is_what_everyone_then_reads_and_a_second_save_replaces_it()
    {
        var admin = await AdminAsync();

        var saved = await admin.PutAsJsonAsync("/api/work-with-me/price", new { currency = "RON", amount = 120.5m });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        Assert.Equal(new WorkWithMePriceDto("RON", 120.5m), await saved.Content.ReadFromJsonAsync<WorkWithMePriceDto>());
        Assert.Equal(new WorkWithMePriceDto("RON", 120.5m), await factory.CreateBrowserClient().GetFromJsonAsync<WorkWithMePriceDto>("/api/work-with-me/price"));

        (await admin.PutAsJsonAsync("/api/work-with-me/price", new { currency = "GBP", amount = 30 })).EnsureSuccessStatusCode();
        Assert.Equal(new WorkWithMePriceDto("GBP", 30m), await factory.CreateBrowserClient().GetFromJsonAsync<WorkWithMePriceDto>("/api/work-with-me/price"));
    }

    [Fact]
    public async Task A_price_that_can_t_be_saved_says_why_and_keeps_the_old_one()
    {
        var admin = await AdminAsync();

        var response = await admin.PutAsJsonAsync("/api/work-with-me/price", new { currency = "BTC", amount = 0 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
        Assert.Equal(["amount", "currency"], problem!.Errors.Keys.Order());
        Assert.Equal(new WorkWithMePriceDto("EUR", 25m), await admin.GetFromJsonAsync<WorkWithMePriceDto>("/api/work-with-me/price"));
    }
}
