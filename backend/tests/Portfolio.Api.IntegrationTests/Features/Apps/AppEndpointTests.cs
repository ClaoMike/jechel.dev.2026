using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Portfolio.Api.Features.Apps;
using Portfolio.Api.Features.Files;
using SkiaSharp;

namespace Portfolio.Api.IntegrationTests.Features.Apps;

[Collection(ApiCollection.Name)]
public class AppEndpointTests(PortfolioApiFactory factory)
{
    private async Task<HttpClient> SignedInClientAsync()
    {
        var client = factory.CreateBrowserClient();
        (await client.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}")).EnsureSuccessStatusCode();
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
        using var bitmap = new SKBitmap(width, height);
        bitmap.Erase(new SKColor(10, 20, 30));
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        return data.ToArray();
    }

    /// <summary>The start of an MP4 ("ftyp" box), then filler: enough for the API, which doesn't decode videos.</summary>
    private static byte[] Mp4() => [0, 0, 0, 0x20, .. "ftypisom"u8, .. new byte[5000]];

    [Theory]
    [InlineData("POST", "/api/apps")]
    [InlineData("PUT", "/api/apps/1")]
    [InlineData("DELETE", "/api/apps/1")]
    [InlineData("POST", "/api/files/app-media")]
    [InlineData("GET", "/api/apps/order")]
    [InlineData("PUT", "/api/apps/order")]
    public async Task Only_the_admin_can_change_apps(string method, string url)
    {
        var request = new HttpRequestMessage(new HttpMethod(method), url) { Content = JsonContent.Create(new AppRequest("x", "", [])) };

        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateBrowserClient().SendAsync(request)).StatusCode);
    }

    [Fact]
    public async Task The_admin_uploads_an_image_and_a_video_adds_an_app_reorders_its_media_and_deletes_it()
    {
        var admin = await SignedInClientAsync();

        var image = (await (await admin.PostAsync("/api/files/app-media", Form(Png(2400, 1200), "shot.png", "image/png"))).Content.ReadFromJsonAsync<UploadedMedia>())!;
        var video = (await (await admin.PostAsync("/api/files/app-media", Form(Mp4(), "Demo clip.mp4", "video/mp4"))).Content.ReadFromJsonAsync<UploadedMedia>())!;
        Assert.Equal((AppMediaKinds.Image, "image.webp"), (image.Kind, image.FileName));
        Assert.Equal((AppMediaKinds.Video, "Demo clip.mp4"), (video.Kind, video.FileName));

        var served = await factory.CreateBrowserClient().GetAsync(image.Url);
        using (var webp = SKBitmap.Decode(await served.Content.ReadAsByteArrayAsync()))
        {
            Assert.Equal((FileRules.AppImageMaxPixels, 960), (webp.Width, webp.Height));
        }

        var create = await admin.PostAsJsonAsync("/api/apps", new AppRequest("My app", "It does things.", [new AppMedia(image.Url, image.Kind), new AppMedia(video.Url, video.Kind)]));
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var app = (await create.Content.ReadFromJsonAsync<AppDetails>())!;

        var update = await admin.PutAsJsonAsync($"/api/apps/{app.Id}", new AppRequest("My app", "It does things.", [new AppMedia(video.Url, video.Kind), new AppMedia(image.Url, image.Kind)]));
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);

        var listed = (await factory.CreateBrowserClient().GetFromJsonAsync<PagedResponse<AppDetails>>("/api/apps?pageSize=50"))!.Items.Single(a => a.Id == app.Id);
        Assert.Equal([AppMediaKinds.Video, AppMediaKinds.Image], listed.Media.Select(m => m.Kind));

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/apps/{app.Id}")).StatusCode);
        Assert.DoesNotContain((await factory.CreateBrowserClient().GetFromJsonAsync<PagedResponse<AppDetails>>("/api/apps?pageSize=50"))!.Items, a => a.Id == app.Id);
    }

    [Fact]
    public async Task A_video_is_served_in_ranges_so_it_can_play_while_loading()
    {
        var admin = await SignedInClientAsync();
        var video = (await (await admin.PostAsync("/api/files/app-media", Form(Mp4(), "clip.mp4", "video/mp4"))).Content.ReadFromJsonAsync<UploadedMedia>())!;

        var request = new HttpRequestMessage(HttpMethod.Get, video.Url);
        request.Headers.Range = new RangeHeaderValue(0, 99);
        var response = await factory.CreateBrowserClient().SendAsync(request);

        Assert.Equal(HttpStatusCode.PartialContent, response.StatusCode);
        Assert.Equal("video/mp4", response.Content.Headers.ContentType!.MediaType);
        Assert.Equal(100, (await response.Content.ReadAsByteArrayAsync()).Length);
    }

    [Fact]
    public async Task Files_that_are_neither_images_nor_videos_are_refused()
    {
        var admin = await SignedInClientAsync();

        var response = await admin.PostAsync("/api/files/app-media", Form("%PDF-1.7"u8.ToArray(), "doc.pdf", "application/pdf"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task There_are_three_categories_to_start_with_and_only_the_admin_changes_them()
    {
        var categories = await factory.CreateBrowserClient().GetFromJsonAsync<AppCategoryDto[]>("/api/apps/categories");
        var anonymous = await factory.CreateBrowserClient().PutAsJsonAsync("/api/apps/categories", categories);

        Assert.Equal(["Mobile app", "Website", "Video game"], categories!.Select(c => c.Name).Take(3));
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
    }

    [Fact]
    public async Task An_app_with_a_category_platforms_and_a_store_link()
    {
        var admin = await SignedInClientAsync();
        var game = (await admin.GetFromJsonAsync<AppCategoryDto[]>("/api/apps/categories"))!.Single(c => c.Name == "Video game");

        var create = await admin.PostAsJsonAsync("/api/apps", new AppRequest("Space game", "", [], [game.Id], ["Windows", "Steam Deck"], [new AppLink("Steam", "https://store.steampowered.com/app/1")]));

        var app = (await create.Content.ReadFromJsonAsync<AppDetails>())!;
        Assert.Equal([game], app.Categories);
        Assert.Equal(["Windows", "Steam Deck"], app.Platforms);
        Assert.Equal("Steam", app.Links[0].Label);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/apps/{app.Id}")).StatusCode);
    }

    [Fact]
    public async Task The_admin_organises_the_apps_and_whats_new_shows_the_first_one_it_may()
    {
        var admin = await SignedInClientAsync();
        // Other tests add apps too: this one works with whatever is there, plus its own two.
        var older = (await (await admin.PostAsJsonAsync("/api/apps", new AppRequest("Organised older", "", []))).Content.ReadFromJsonAsync<AppDetails>())!;
        // Off from the start: stored as false (a database default of true would win over a false the API leaves out).
        var newer = (await (await admin.PostAsJsonAsync("/api/apps", new AppRequest("Organised newer", "", [], ShowInWhatsNew: false))).Content.ReadFromJsonAsync<AppDetails>())!;
        Assert.False(newer.ShowInWhatsNew);

        var order = (await admin.GetFromJsonAsync<List<AppOrderItem>>("/api/apps/order"))!;
        Assert.Equal([newer.Id, older.Id], order.Take(2).Select(o => o.Id));
        Assert.False(order[0].ShowInWhatsNew);

        // The older one last, and the only one What's new? may show.
        var reordered = order.Where(o => o.Id != older.Id).Select(o => new AppOrderRequest(o.Id, false)).Append(new AppOrderRequest(older.Id, true)).ToList();
        var saved = await admin.PutAsJsonAsync("/api/apps/order", reordered);
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);

        var visitor = factory.CreateBrowserClient();
        var listed = (await visitor.GetFromJsonAsync<PagedResponse<AppDetails>>($"/api/apps?pageSize={AppEndpoints.MaxPageSize}"))!;
        Assert.Equal(older.Id, listed.Items[^1].Id);
        Assert.Equal(older.Id, (await visitor.GetFromJsonAsync<WhatsNewApp>("/api/apps/whats-new"))!.App!.Id);

        var stale = await admin.PutAsJsonAsync("/api/apps/order", reordered.Skip(1));
        Assert.Equal(HttpStatusCode.BadRequest, stale.StatusCode);
    }
}
