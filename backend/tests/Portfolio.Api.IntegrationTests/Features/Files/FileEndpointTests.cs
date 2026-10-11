using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Portfolio.Api.Features.Files;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace Portfolio.Api.IntegrationTests.Features.Files;

[Collection(ApiCollection.Name)]
public class FileEndpointTests(PortfolioApiFactory factory)
{
    private async Task<HttpClient> SignedInClientAsync()
    {
        var client = factory.CreateBrowserClient();
        var response = await client.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}");
        response.EnsureSuccessStatusCode();
        return client;
    }

    private static MultipartFormDataContent Form(byte[] bytes, string fileName, string contentType)
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return new MultipartFormDataContent { { file, "file", fileName } };
    }

    private static byte[] Png(int width, int height)
    {
        using var image = new Image<Rgba32>(width, height, new Rgba32(10, 20, 30));
        using var stream = new MemoryStream();
        image.SaveAsPng(stream);
        return stream.ToArray();
    }

    [Fact]
    public async Task Only_the_admin_can_upload()
    {
        var client = factory.CreateBrowserClient();

        var photo = await client.PostAsync("/api/files/photo", Form(Png(10, 10), "me.png", "image/png"));
        var resume = await client.PostAsync("/api/files/resume", Form("%PDF-1.7"u8.ToArray(), "cv.pdf", "application/pdf"));

        Assert.Equal(HttpStatusCode.Unauthorized, photo.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, resume.StatusCode);
    }

    [Fact]
    public async Task An_uploaded_photo_is_served_to_everyone_as_a_webp()
    {
        var admin = await SignedInClientAsync();

        var upload = await admin.PostAsync("/api/files/photo", Form(Png(1600, 1600), "me.png", "image/png"));

        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        var uploaded = (await upload.Content.ReadFromJsonAsync<UploadedFile>())!;
        Assert.StartsWith("/api/files/", uploaded.Url);
        var served = await factory.CreateBrowserClient().GetAsync(uploaded.Url);
        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal("image/webp", served.Content.Headers.ContentType!.MediaType);
        Assert.Equal("nosniff", served.Headers.GetValues("X-Content-Type-Options").Single());
        using var image = Image.Load(await served.Content.ReadAsByteArrayAsync());
        Assert.Equal((800, 800), (image.Width, image.Height));
    }

    [Fact]
    public async Task A_resume_keeps_its_bytes_and_name()
    {
        var admin = await SignedInClientAsync();
        var pdf = "%PDF-1.7\nhello"u8.ToArray();

        var upload = await admin.PostAsync("/api/files/resume", Form(pdf, "Claudiu Jechel CV.pdf", "application/pdf"));

        var uploaded = (await upload.Content.ReadFromJsonAsync<UploadedFile>())!;
        Assert.Equal("Claudiu Jechel CV.pdf", uploaded.FileName);
        var served = await factory.CreateBrowserClient().GetAsync(uploaded.Url);
        Assert.Equal(pdf, await served.Content.ReadAsByteArrayAsync());
        Assert.Equal("application/pdf", served.Content.Headers.ContentType!.MediaType);
        Assert.Equal("Claudiu Jechel CV.pdf", served.Content.Headers.ContentDisposition!.FileName?.Trim('"'));
    }

    [Fact]
    public async Task A_paper_is_uploaded_like_a_resume()
    {
        var admin = await SignedInClientAsync();

        var upload = await admin.PostAsync("/api/files/paper", Form("%PDF-1.7\npaper"u8.ToArray(), "PCG paper.pdf", "application/pdf"));

        var uploaded = (await upload.Content.ReadFromJsonAsync<UploadedFile>())!;
        Assert.Equal("PCG paper.pdf", uploaded.FileName);
        Assert.Equal(HttpStatusCode.OK, (await factory.CreateBrowserClient().GetAsync(uploaded.Url)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateBrowserClient().PostAsync("/api/files/paper", Form("%PDF-"u8.ToArray(), "p.pdf", "application/pdf"))).StatusCode);
    }

    [Theory]
    [InlineData("/api/files/paper", "<html>not a pdf</html>")]
    [InlineData("/api/files/photo", "not an image")]
    [InlineData("/api/files/resume", "<html>not a pdf</html>")]
    public async Task Wrong_file_types_are_rejected(string path, string body)
    {
        var admin = await SignedInClientAsync();

        var response = await admin.PostAsync(path, Form(System.Text.Encoding.UTF8.GetBytes(body), "file.bin", "application/octet-stream"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
        Assert.Equal(["file"], problem!.Errors.Keys);
    }

    [Fact]
    public async Task An_unknown_file_is_not_found()
    {
        var response = await factory.CreateBrowserClient().GetAsync($"/api/files/{Guid.NewGuid()}/photo.webp");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
