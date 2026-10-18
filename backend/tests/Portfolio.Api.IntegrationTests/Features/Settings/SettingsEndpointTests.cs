using System.Net;
using System.Net.Http.Json;
using Portfolio.Api.Features.Settings;
using Portfolio.Api.Features.Support;

namespace Portfolio.Api.IntegrationTests.Features.Settings;

[Collection(ApiCollection.Name)]
public class SettingsEndpointTests(PortfolioApiFactory factory)
{
    private async Task<HttpClient> SignedInClientAsync()
    {
        var client = factory.CreateBrowserClient();
        var response = await client.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}");
        response.EnsureSuccessStatusCode();
        return client;
    }

    [Theory]
    [InlineData("GET", "/api/settings")]
    [InlineData("PUT", "/api/settings/Support:Url")]
    [InlineData("POST", "/api/settings/test/ntfy")]
    public async Task Visitors_cant_see_or_change_settings(string method, string path)
    {
        var response = await factory.CreateBrowserClient().SendAsync(new HttpRequestMessage(new HttpMethod(method), path) { Content = JsonContent.Create(new SaveSettingRequest("x")) });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task A_saved_setting_applies_at_once_and_clearing_it_brings_the_configuration_back()
    {
        var admin = await SignedInClientAsync();

        var save = await admin.PutAsJsonAsync("/api/settings/Support:Url", new SaveSettingRequest("https://buymeacoffee.com/claomike"));
        Assert.Equal(HttpStatusCode.OK, save.StatusCode);
        Assert.Equal("https://buymeacoffee.com/claomike", (await factory.CreateBrowserClient().GetFromJsonAsync<SupportInfo>("/api/support"))!.Url);

        await admin.PutAsJsonAsync("/api/settings/Support:Url", new SaveSettingRequest(""));
        Assert.Equal("https://buymeacoffee.com/test", (await factory.CreateBrowserClient().GetFromJsonAsync<SupportInfo>("/api/support"))!.Url);
    }

    [Fact]
    public async Task Secrets_never_go_back_to_the_browser()
    {
        var admin = await SignedInClientAsync();
        const string key = "re_TESTsecretVALUE1234";

        var save = await admin.PutAsJsonAsync("/api/settings/Email:ResendApiKey", new SaveSettingRequest(key));
        var body = await save.Content.ReadAsStringAsync();
        var listed = await admin.GetStringAsync("/api/settings");

        try
        {
            Assert.DoesNotContain(key, body);
            Assert.DoesNotContain(key, listed);
            var settings = await admin.GetFromJsonAsync<SettingsResponse>("/api/settings");
            var setting = Assert.Single(settings!.Settings, s => s.Key == "Email:ResendApiKey");
            Assert.Equal((true, "1234", "settings", (string?)null), (setting.IsSet, setting.Hint, setting.Source, setting.Value));
            Assert.True(settings.Google.IsConfigured);
            Assert.Equal("https://jechel.test/api/auth/signin-google", settings.Google.RedirectUri);
        }
        finally
        {
            await admin.PutAsJsonAsync("/api/settings/Email:ResendApiKey", new SaveSettingRequest(""));
        }
    }

    [Fact]
    public async Task Bad_values_and_unknown_keys_are_refused()
    {
        var admin = await SignedInClientAsync();

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync("/api/settings/Support:Url", new SaveSettingRequest("javascript:alert(1)"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PutAsJsonAsync("/api/settings/ConnectionStrings:Default", new SaveSettingRequest("x"))).StatusCode);
    }

    [Fact]
    public async Task The_youtube_test_lists_the_videos()
    {
        var admin = await SignedInClientAsync();

        var result = await (await admin.PostAsync("/api/settings/test/youtube", null)).Content.ReadFromJsonAsync<TestResult>();

        Assert.Equal(new TestResult(true, "Found 11 public videos."), result);
    }
}
