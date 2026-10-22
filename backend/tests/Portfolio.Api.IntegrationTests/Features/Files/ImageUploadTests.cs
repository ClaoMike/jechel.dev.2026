using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Portfolio.Api.Features.Files;
using SkiaSharp;

namespace Portfolio.Api.IntegrationTests.Features.Files;

/// <summary>Uploading a photo or an app image through the real API: stored as a WebP the site serves.</summary>
[Collection(ApiCollection.Name)]
public class ImageUploadTests(PortfolioApiFactory factory)
{
    private async Task<HttpClient> AdminAsync()
    {
        var admin = factory.CreateBrowserClient();
        (await admin.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}")).EnsureSuccessStatusCode();
        return admin;
    }

    private static byte[] Jpeg(int width, int height)
    {
        using var bitmap = new SKBitmap(width, height);
        bitmap.Erase(new SKColor(30, 120, 200));
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 90);
        return data.ToArray();
    }

    private static MultipartFormDataContent Form(byte[] bytes, string fileName, string contentType)
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return new MultipartFormDataContent { { file, "file", fileName } };
    }

    private static async Task<SKBitmap> DownloadAsync(HttpClient client, string url)
    {
        var response = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("image/webp", response.Content.Headers.ContentType?.MediaType);
        return SKBitmap.Decode(await response.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task A_photo_is_stored_as_a_WebP_of_at_most_800_pixels()
    {
        var admin = await AdminAsync();

        var response = await admin.PostAsync("/api/files/photo", Form(Jpeg(1600, 1200), "me.jpg", "image/jpeg"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var uploaded = (await response.Content.ReadFromJsonAsync<UploadedFile>())!;
        Assert.Equal("photo.webp", uploaded.FileName);
        using var stored = await DownloadAsync(factory.CreateClient(), uploaded.Url);
        Assert.Equal((800, 600), (stored.Width, stored.Height));
    }

    [Fact]
    public async Task An_app_image_is_stored_as_a_WebP_of_at_most_1920_pixels()
    {
        var admin = await AdminAsync();

        var response = await admin.PostAsync("/api/files/app-media", Form(Jpeg(2400, 1200), "screenshot.jpg", "image/jpeg"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var uploaded = (await response.Content.ReadFromJsonAsync<UploadedMedia>())!;
        Assert.Equal("image", uploaded.Kind);
        using var stored = await DownloadAsync(factory.CreateClient(), uploaded.Url);
        Assert.Equal((1920, 960), (stored.Width, stored.Height));
    }

    [Theory]
    [InlineData("/api/files/photo", "That file isn't an image we can read. Try a JPEG, PNG or WebP.")]
    [InlineData("/api/files/app-media", "That file isn't an image or video we can use. Try a JPEG, PNG, WebP, GIF, MP4, MOV or WebM.")]
    public async Task What_isnt_an_image_is_refused_with_a_reason(string path, string reason)
    {
        var admin = await AdminAsync();

        var response = await admin.PostAsync(path, Form("just some text"u8.ToArray(), "notes.jpg", "image/jpeg"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(reason, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Only_the_admin_can_upload()
    {
        var response = await factory.CreateClient().PostAsync("/api/files/photo", Form(Jpeg(10, 10), "me.jpg", "image/jpeg"));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
