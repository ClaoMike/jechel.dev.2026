using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Portfolio.Api.Features.Terms;

namespace Portfolio.Api.IntegrationTests.Features.Terms;

[Collection(ApiCollection.Name)]
public class TermsEndpointTests(PortfolioApiFactory factory)
{
    private async Task<HttpClient> SignedInClientAsync()
    {
        var client = factory.CreateBrowserClient();
        var response = await client.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}");
        response.EnsureSuccessStatusCode();
        return client;
    }

    [Fact]
    public async Task Anyone_can_read_the_terms()
    {
        var response = await factory.CreateBrowserClient().GetAsync("/api/terms");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var terms = await response.Content.ReadFromJsonAsync<TermsDocument>();
        Assert.False(string.IsNullOrEmpty(terms!.Title));
        Assert.NotNull(terms.UpdatedAt);
    }

    [Fact]
    public async Task Only_the_admin_can_change_them()
    {
        var response = await factory.CreateBrowserClient().PutAsJsonAsync("/api/terms", TermsDefaults.Content);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task The_admin_saves_the_terms_and_everyone_sees_them_with_the_date()
    {
        var admin = await SignedInClientAsync();
        var marker = $"Terms {Guid.NewGuid():N}";
        var content = new TermsContent(marker, "Intro", [new TermsSection("Use", [new TermsBlock(TermsBlockKinds.Paragraph, "Be kind.", []), new TermsBlock(TermsBlockKinds.Bullets, "", ["One", "Two"])])]);

        var put = await admin.PutAsJsonAsync("/api/terms", content);
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);

        var terms = await factory.CreateBrowserClient().GetFromJsonAsync<TermsDocument>("/api/terms");
        Assert.Equal(marker, terms!.Title);
        Assert.Equal(["paragraph", "bullets"], terms.Sections[0].Blocks.Select(b => b.Kind));
        Assert.Equal(["One", "Two"], terms.Sections[0].Blocks[1].Items);
        Assert.NotNull(terms.UpdatedAt);
    }

    [Fact]
    public async Task Invalid_terms_return_field_errors()
    {
        var admin = await SignedInClientAsync();

        var response = await admin.PutAsJsonAsync("/api/terms", new TermsContent("Terms", "", [new TermsSection("", [new TermsBlock(TermsBlockKinds.Bullets, "", [])])]));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
        Assert.Equal(["sections[0].blocks[0].items", "sections[0].heading"], problem!.Errors.Keys.Order());
    }
}
