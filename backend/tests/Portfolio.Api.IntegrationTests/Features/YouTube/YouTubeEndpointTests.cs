using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Settings;
using Portfolio.Api.Features.YouTube;

namespace Portfolio.Api.IntegrationTests.Features.YouTube;

/// <summary>
/// GET /api/youtube/videos through the real pipeline and PostgreSQL. The channel is the factory's
/// "@test" with <see cref="FakeYouTubeClient.Eleven"/> videos; tests that change it put it back.
/// </summary>
[Collection(ApiCollection.Name)]
public class YouTubeEndpointTests(PortfolioApiFactory factory) : IAsyncLifetime
{
    private record VideoPage(List<YouTubeVideo> Items, int Page, int PageSize, int TotalCount);

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync()
    {
        factory.YouTube.Fails = false;
        factory.YouTube.Videos = FakeYouTubeClient.Eleven;
        await RefreshAsync(factory);
    }

    private static async Task<bool> RefreshAsync(WebApplicationFactory<Program> api) =>
        await api.Services.GetRequiredService<YouTubeVideoStore>().RefreshAsync(CancellationToken.None) is not null;

    private static async Task<VideoPage> GetPageAsync(HttpClient client, string query = "")
    {
        var response = await client.GetAsync($"/api/youtube/videos{query}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<VideoPage>())!;
    }

    private async Task<YouTubeSnapshot?> SavedAsync(string channel = "@test")
    {
        using var scope = factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<PortfolioDbContext>().YouTubeSnapshots.AsNoTracking().FirstOrDefaultAsync(s => s.Channel == channel);
    }

    [Fact]
    public async Task Lists_nine_videos_newest_first_with_everything_a_tile_shows()
    {
        var page = await GetPageAsync(factory.CreateClient());

        Assert.Equal(["v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8", "v9"], page.Items.Select(v => v.Id));
        Assert.Equal((1, 9, 11), (page.Page, page.PageSize, page.TotalCount));
        Assert.Equal(FakeYouTubeClient.Eleven[0], page.Items[0]);
    }

    [Fact]
    public async Task Sends_each_videos_link_on_YouTube()
    {
        var json = await factory.CreateClient().GetStringAsync("/api/youtube/videos?pageSize=1");

        Assert.Contains("\"url\":\"https://www.youtube.com/watch?v=v1\"", json);
        Assert.Contains("\"publishedAt\":\"1970-04-10T00:00:00+00:00\"", json);
    }

    [Fact]
    public async Task Lists_the_second_page_and_asked_sizes()
    {
        var client = factory.CreateClient();

        Assert.Equal(["v10", "v11"], (await GetPageAsync(client, "?page=2")).Items.Select(v => v.Id));
        Assert.Equal(["v1", "v2", "v3"], (await GetPageAsync(client, "?pageSize=3")).Items.Select(v => v.Id));
        Assert.Empty((await GetPageAsync(client, "?page=9")).Items);
    }

    [Fact]
    public async Task Answers_400_for_a_page_that_isnt_a_number()
    {
        var response = await factory.CreateClient().GetAsync("/api/youtube/videos?page=two");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Lets_a_visitors_browser_keep_a_page_for_five_minutes()
    {
        var response = await factory.CreateClient().GetAsync("/api/youtube/videos");

        Assert.True(response.Headers.CacheControl!.Private);
        Assert.Equal(TimeSpan.FromMinutes(5), response.Headers.CacheControl.MaxAge);
        Assert.Equal(["Cookie"], response.Headers.Vary);
    }

    [Fact]
    public async Task Saves_the_list_in_the_database()
    {
        await GetPageAsync(factory.CreateClient());

        var saved = await SavedAsync();
        Assert.NotNull(saved);
        Assert.Equal(FakeYouTubeClient.Eleven, JsonSerializer.Deserialize<List<YouTubeVideo>>(saved.Videos, JsonSerializerOptions.Web));
    }

    [Fact]
    public async Task Visitors_dont_cause_calls_to_YouTube_once_its_list_is_kept()
    {
        var client = factory.CreateClient();
        await GetPageAsync(client);
        var before = factory.YouTube.Calls;

        await Task.WhenAll(Enumerable.Range(1, 10).Select(n => GetPageAsync(client, $"?page={n % 3 + 1}")));

        Assert.Equal(before, factory.YouTube.Calls);
    }

    [Fact]
    public async Task A_refresh_shows_new_videos()
    {
        var client = factory.CreateClient();
        await GetPageAsync(client);
        factory.YouTube.Videos = [new YouTubeVideo("new", "Brand new", "", "https://i.ytimg.com/vi/new/hqdefault.jpg", DateTimeOffset.UnixEpoch.AddDays(200)), .. FakeYouTubeClient.Eleven];

        Assert.True(await RefreshAsync(factory));

        var page = await GetPageAsync(client);
        Assert.Equal("new", page.Items[0].Id);
        Assert.Equal(12, page.TotalCount);
    }

    [Fact]
    public async Task After_a_restart_while_YouTube_is_down_shows_the_saved_list()
    {
        await GetPageAsync(factory.CreateClient());
        factory.YouTube.Fails = true;

        // A new host: a new store with nothing in memory, as after a deploy.
        await using var restarted = factory.WithWebHostBuilder(_ => { });
        var page = await GetPageAsync(restarted.CreateClient());

        Assert.Equal(11, page.TotalCount);
        Assert.False(await RefreshAsync(restarted));
        Assert.Equal(11, (await GetPageAsync(restarted.CreateClient())).TotalCount);
    }

    [Fact]
    public async Task Answers_503_when_theres_no_list_yet_and_YouTube_is_down()
    {
        factory.YouTube.Fails = true;
        await using var other = factory.WithWebHostBuilder(builder => builder.UseSetting("YouTube:Channel", "@nobody-saved-this"));

        var response = await other.CreateClient().GetAsync("/api/youtube/videos");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("YouTube can't be reached right now.", await response.Content.ReadAsStringAsync());
        Assert.Null(response.Headers.CacheControl);
    }

    [Fact]
    public async Task Answers_503_until_YouTube_is_set_up()
    {
        await using var unset = factory.WithWebHostBuilder(builder => builder.UseSetting("YouTube:ApiKey", ""));

        var response = await unset.CreateClient().GetAsync("/api/youtube/videos");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("YouTube isn't set up", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Changing_the_channel_in_Settings_shows_that_channels_videos()
    {
        var visitor = factory.CreateClient();
        await GetPageAsync(visitor);
        var admin = factory.CreateBrowserClient();
        (await admin.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}")).EnsureSuccessStatusCode();
        factory.YouTube.Videos = [new YouTubeVideo("theirs", "Their video", "", "https://i.ytimg.com/vi/theirs/hqdefault.jpg", DateTimeOffset.UnixEpoch)];

        try
        {
            (await admin.PutAsJsonAsync("/api/settings/YouTube:Channel", new SaveSettingRequest("@Someone"))).EnsureSuccessStatusCode();

            Assert.Equal(["theirs"], (await GetPageAsync(visitor)).Items.Select(v => v.Id));
            Assert.NotNull(await SavedAsync("@someone"));
        }
        finally
        {
            (await admin.PutAsJsonAsync("/api/settings/YouTube:Channel", new SaveSettingRequest(""))).EnsureSuccessStatusCode();
        }

        // Back on the configured channel: its own saved list.
        Assert.Equal(11, (await GetPageAsync(visitor)).TotalCount);
    }

    private async Task<HttpClient> AdminAsync()
    {
        var admin = factory.CreateBrowserClient();
        (await admin.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}")).EnsureSuccessStatusCode();
        return admin;
    }

    [Fact]
    public async Task Only_the_admin_can_refresh()
    {
        var calls = factory.YouTube.Calls;

        var response = await factory.CreateClient().PostAsync("/api/youtube/refresh", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(calls, factory.YouTube.Calls);
    }

    [Fact]
    public async Task The_admins_refresh_shows_a_new_video_at_once_to_everyone()
    {
        var visitor = factory.CreateClient();
        await GetPageAsync(visitor);
        var admin = await AdminAsync();
        factory.YouTube.Videos = [new YouTubeVideo("just-uploaded", "Just uploaded", "", "https://i.ytimg.com/vi/just-uploaded/hqdefault.jpg", DateTimeOffset.UnixEpoch.AddDays(300)), .. FakeYouTubeClient.Eleven];

        var response = await admin.PostAsync("/api/youtube/refresh", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(new RefreshResult(12), await response.Content.ReadFromJsonAsync<RefreshResult>());
        Assert.Equal("just-uploaded", (await GetPageAsync(admin)).Items[0].Id);
        Assert.Equal("just-uploaded", (await GetPageAsync(visitor)).Items[0].Id);
        Assert.Contains("just-uploaded", (await SavedAsync())!.Videos);
    }

    [Fact]
    public async Task The_admins_browser_never_keeps_the_list()
    {
        var response = await (await AdminAsync()).GetAsync("/api/youtube/videos");

        Assert.True(response.Headers.CacheControl?.NoStore);
    }

    [Fact]
    public async Task A_refresh_while_YouTube_is_down_answers_503_and_keeps_the_list()
    {
        var admin = await AdminAsync();
        await GetPageAsync(admin);
        factory.YouTube.Fails = true;

        var response = await admin.PostAsync("/api/youtube/refresh", null);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("the videos shown are the last ones saved", await response.Content.ReadAsStringAsync());
        Assert.Equal(11, (await GetPageAsync(admin)).TotalCount);
    }

    [Fact]
    public async Task Settings_test_counts_the_channels_public_videos()
    {
        var admin = factory.CreateBrowserClient();
        (await admin.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}")).EnsureSuccessStatusCode();

        var result = await (await admin.PostAsync("/api/settings/test/youtube", null)).Content.ReadFromJsonAsync<TestResult>();
        factory.YouTube.Fails = true;
        var failed = await (await admin.PostAsync("/api/settings/test/youtube", null)).Content.ReadFromJsonAsync<TestResult>();

        Assert.Equal(new TestResult(true, "Found 11 public videos."), result);
        Assert.False(failed!.Ok);
    }
}
