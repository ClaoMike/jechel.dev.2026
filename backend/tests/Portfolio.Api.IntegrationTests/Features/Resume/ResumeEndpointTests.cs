using System.Net;
using System.Net.Http.Json;
using Portfolio.Api.Features.About;
using Portfolio.Api.Features.Resume;
using UglyToad.PdfPig;

namespace Portfolio.Api.IntegrationTests.Features.Resume;

[Collection(ApiCollection.Name)]
public class ResumeEndpointTests(PortfolioApiFactory factory)
{
    private const string Phone = "+44 7700 900456";

    private async Task<HttpClient> SignedInClientAsync()
    {
        var client = factory.CreateBrowserClient();
        var response = await client.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}");
        response.EnsureSuccessStatusCode();
        return client;
    }

    private static string TextOf(byte[] pdf)
    {
        using var document = PdfDocument.Open(pdf);
        return string.Join("\n", document.GetPages().Select(p => p.Text));
    }

    [Theory]
    [InlineData("/api/resume/private")]
    [InlineData("/api/resume/settings")]
    public async Task Visitors_cant_reach_the_private_copy_or_the_settings(string path)
    {
        var response = await factory.CreateBrowserClient().GetAsync(path);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Visitors_cant_generate()
    {
        var response = await factory.CreateBrowserClient().PostAsJsonAsync("/api/resume/generate", new ResumeSettingsRequest(Phone, "", "", "", "", []));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Generating_gives_visitors_a_copy_without_the_phone_and_the_admin_one_with_it()
    {
        var admin = await SignedInClientAsync();
        var settings = new ResumeSettingsRequest(Phone, "claudiu@example.com", "Full-stack engineer", "Manchester, UK", "I build things.", [ResumeSections.Experience, ResumeSections.Summary], ["Cobol"]);

        var generate = await admin.PostAsJsonAsync("/api/resume/generate", settings);
        Assert.Equal(HttpStatusCode.OK, generate.StatusCode);
        var saved = await generate.Content.ReadFromJsonAsync<ResumeSettingsDto>();
        Assert.NotNull(saved!.GeneratedAt);
        Assert.Equal([ResumeSections.Summary, ResumeSections.Experience], saved.Sections);
        Assert.Equal(["Cobol"], saved.ExcludedSkills);

        var visitor = factory.CreateBrowserClient();
        var publicPdf = await visitor.GetAsync("/api/resume");
        Assert.Equal(HttpStatusCode.OK, publicPdf.StatusCode);
        Assert.Equal("application/pdf", publicPdf.Content.Headers.ContentType!.MediaType);
        Assert.Equal(ResumeDocument.FileName, publicPdf.Content.Headers.ContentDisposition!.FileName!.Trim('"'));
        var publicText = TextOf(await publicPdf.Content.ReadAsByteArrayAsync());
        Assert.Contains("I build things.", publicText);
        Assert.DoesNotContain("7700", publicText);

        var privateText = TextOf(await admin.GetByteArrayAsync("/api/resume/private"));
        Assert.Contains("7700", privateText);

        // The page's download button now points at the generated copy, and the page never holds the phone.
        var aboutJson = await visitor.GetStringAsync("/api/about");
        Assert.DoesNotContain("7700", aboutJson);
        var about = await visitor.GetFromJsonAsync<AboutContent>("/api/about");
        Assert.StartsWith("/api/resume?v=", about!.Links.ResumeUrl);

        var again = await admin.GetFromJsonAsync<ResumeSettingsDto>("/api/resume/settings");
        Assert.Equal(Phone, again!.Phone);
    }

    [Fact]
    public async Task Invalid_settings_return_field_errors()
    {
        var admin = await SignedInClientAsync();

        var response = await admin.PutAsJsonAsync("/api/resume/settings", new ResumeSettingsRequest("call me maybe", "", "", "", "", ["map"]));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("phone", body);
        Assert.Contains("sections", body);
    }
}
