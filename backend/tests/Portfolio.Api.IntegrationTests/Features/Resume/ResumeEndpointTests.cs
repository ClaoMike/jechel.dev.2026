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
        var response = await factory.CreateBrowserClient().PostAsJsonAsync("/api/resume/generate", new ResumeChoices([], []));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Generating_gives_visitors_a_copy_without_the_email_and_phone_and_the_admin_one_with_them()
    {
        var admin = await SignedInClientAsync();
        var contact = await admin.PutAsJsonAsync("/api/resume/contact", new ResumeContact(Phone, "claudiu@example.com", "Full-stack engineer"));
        Assert.Equal(HttpStatusCode.OK, contact.StatusCode);

        var generate = await admin.PostAsJsonAsync("/api/resume/generate", new ResumeChoices([ResumeSections.Experience, ResumeSections.Statuses], ["Cobol"]));
        Assert.Equal(HttpStatusCode.OK, generate.StatusCode);
        var saved = await generate.Content.ReadFromJsonAsync<ResumeSettingsDto>();
        Assert.NotNull(saved!.GeneratedAt);
        Assert.Equal([ResumeSections.Statuses, ResumeSections.Experience], saved.Sections);
        Assert.Equal(["Cobol"], saved.ExcludedSkills);

        var visitor = factory.CreateBrowserClient();
        var publicPdf = await visitor.GetAsync("/api/resume");
        Assert.Equal(HttpStatusCode.OK, publicPdf.StatusCode);
        Assert.Equal("application/pdf", publicPdf.Content.Headers.ContentType!.MediaType);
        Assert.Equal(ResumeDocument.FileName, publicPdf.Content.Headers.ContentDisposition!.FileName!.Trim('"'));
        var publicText = TextOf(await publicPdf.Content.ReadAsByteArrayAsync());
        Assert.Contains("Full-stack engineer", publicText);
        // The number's last part: specific enough that nothing else in the document (dates, a version) has it.
        Assert.DoesNotContain("900456", publicText);
        Assert.DoesNotContain("claudiu@example.com", publicText);

        var privateText = TextOf(await admin.GetByteArrayAsync("/api/resume/private"));
        Assert.Contains("900456", privateText);
        Assert.Contains("claudiu@example.com", privateText);

        // The page's download button now points at the generated copy, and the page never holds the phone.
        var aboutJson = await visitor.GetStringAsync("/api/about");
        // Not "7700": the résumé link's version (a time) can hold those digits.
        Assert.DoesNotContain(Phone, aboutJson);
        Assert.DoesNotContain("900456", aboutJson);
        var about = await visitor.GetFromJsonAsync<AboutContent>("/api/about");
        Assert.StartsWith("/api/resume?v=", about!.Links.ResumeUrl);

        var again = await admin.GetFromJsonAsync<ResumeSettingsDto>("/api/resume/settings");
        Assert.Equal(Phone, again!.Phone);
    }

    [Fact]
    public async Task Invalid_settings_return_field_errors()
    {
        var admin = await SignedInClientAsync();

        var contact = await admin.PutAsJsonAsync("/api/resume/contact", new ResumeContact("call me maybe", "", ""));
        var choices = await admin.PutAsJsonAsync("/api/resume/choices", new ResumeChoices(["map"], []));

        Assert.Equal(HttpStatusCode.BadRequest, contact.StatusCode);
        Assert.Contains("phone", await contact.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.BadRequest, choices.StatusCode);
        Assert.Contains("sections", await choices.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Visitors_see_the_headline_but_not_the_email_or_phone()
    {
        var admin = await SignedInClientAsync();
        await admin.PutAsJsonAsync("/api/resume/contact", new ResumeContact(Phone, "claudiu@example.com", " Full-stack engineer "));

        var response = await factory.CreateBrowserClient().GetAsync("/api/resume/headline");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal("""{"headline":"Full-stack engineer"}""", body);
        Assert.Equal("no-cache", response.Headers.CacheControl!.ToString());

        // A change shows at once.
        await admin.PutAsJsonAsync("/api/resume/contact", new ResumeContact(Phone, "claudiu@example.com", "Engineer"));
        Assert.Equal("Engineer", (await factory.CreateBrowserClient().GetFromJsonAsync<ResumeHeadline>("/api/resume/headline"))!.Headline);
    }
}
