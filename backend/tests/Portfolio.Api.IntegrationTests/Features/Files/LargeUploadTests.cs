using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Portfolio.Api.Features.Files;

namespace Portfolio.Api.IntegrationTests.Features.Files;

/// <summary>Big uploads on a real Kestrel server, whose default request limit is 30 MB.</summary>
[Collection(KestrelApiCollection.Name)]
public class LargeUploadTests(KestrelApiFactory factory)
{
    private async Task<HttpClient> SignedInClientAsync()
    {
        var client = factory.CreateKestrelClient();
        (await client.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}")).EnsureSuccessStatusCode();
        return client;
    }

    private static MultipartFormDataContent Pdf(int megabytes)
    {
        var bytes = new byte[megabytes * 1024 * 1024];
        "%PDF-1.7\n"u8.CopyTo(bytes);
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        return new MultipartFormDataContent { { file, "file", "big.pdf" } };
    }

    [Fact]
    public async Task A_paper_bigger_than_the_server_default_is_accepted()
    {
        var admin = await SignedInClientAsync();

        var upload = await admin.PostAsync("/api/files/paper", Pdf(45));

        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        var uploaded = (await upload.Content.ReadFromJsonAsync<UploadedFile>())!;
        var served = await factory.CreateKestrelClient().GetAsync(uploaded.Url);
        Assert.Equal(45 * 1024 * 1024, (await served.Content.ReadAsByteArrayAsync()).Length);
    }

    [Fact]
    public async Task A_resume_over_its_limit_is_refused_with_a_reason()
    {
        var admin = await SignedInClientAsync();

        // Waits for the server's go-ahead before sending the body, so it gets the answer instead
        // of a closed connection when the server turns the request down unread.
        admin.DefaultRequestHeaders.ExpectContinue = true;
        var upload = await admin.PostAsync("/api/files/resume", Pdf(25));

        Assert.Equal(HttpStatusCode.BadRequest, upload.StatusCode);
        var problem = await upload.Content.ReadFromJsonAsync<ValidationProblemDetails>();
        Assert.Equal("The file must be at most 20 MB.", problem!.Errors["file"][0]);
    }
}
