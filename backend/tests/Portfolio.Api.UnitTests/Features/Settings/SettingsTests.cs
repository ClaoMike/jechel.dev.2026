using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Settings;

namespace Portfolio.Api.UnitTests.Features.Settings;

public class SettingsTests
{
    private readonly PortfolioDbContext _db = new(new DbContextOptionsBuilder<PortfolioDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    [Theory]
    [InlineData("Support:Url", "https://buymeacoffee.com/claomike", null)]
    [InlineData("Support:Url", "ftp://example.com", "Enter an http(s) link.")]
    [InlineData("Email:From", "jechel.dev <updates@jechel.dev>", null)]
    [InlineData("Email:From", "updates@jechel.dev", null)]
    [InlineData("Email:From", "nobody", "Enter an address, or a name and address like: jechel.dev <updates@jechel.dev>")]
    [InlineData("Alerts:NtfyTopic", "jechel-1f3a_x", null)]
    [InlineData("Alerts:NtfyTopic", "has spaces", "Use letters, digits, - and _ only.")]
    [InlineData("YouTube:ApiKey", "", null)]
    public void Values_are_checked_by_kind(string key, string value, string? error) =>
        Assert.Equal(error, SettingsCatalog.Validate(SettingsCatalog.Find(key)!, value));

    [Fact]
    public async Task Saved_settings_override_the_configuration_and_secrets_are_stored_encrypted()
    {
        var protection = new EphemeralDataProtectionProvider();
        var store = new SettingsStore(protection, NullLogger<SettingsStore>.Instance);
        _db.SiteSettings.Add(new SiteSetting { Key = "Alerts:NtfyTopic", Value = store.Protect("secret-topic"), IsEncrypted = true });
        _db.SiteSettings.Add(new SiteSetting { Key = "Alerts:NtfyServer", Value = "https://ntfy.example", IsEncrypted = false });
        await _db.SaveChangesAsync();

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Alerts:NtfyTopic"] = "from-config",
            ["Alerts:NtfyToken"] = "config-token",
        }).Build();
        var services = new ServiceCollection().AddSingleton(store).BindWithSettings<AlertOptions>(configuration, AlertOptions.Section).BuildServiceProvider();
        var monitor = services.GetRequiredService<IOptionsMonitor<AlertOptions>>();
        Assert.Equal("from-config", monitor.CurrentValue.NtfyTopic);

        await store.ReloadAsync(_db, default);

        Assert.Equal("secret-topic", monitor.CurrentValue.NtfyTopic);
        Assert.Equal("https://ntfy.example", monitor.CurrentValue.NtfyServer);
        Assert.Equal("config-token", monitor.CurrentValue.NtfyToken);
        Assert.DoesNotContain("secret-topic", _db.SiteSettings.Single(s => s.Key == "Alerts:NtfyTopic").Value);
    }

    [Fact]
    public async Task A_secret_that_cant_be_decrypted_is_treated_as_not_set()
    {
        var other = new SettingsStore(new EphemeralDataProtectionProvider(), NullLogger<SettingsStore>.Instance);
        _db.SiteSettings.Add(new SiteSetting { Key = "Email:ResendApiKey", Value = other.Protect("re_old"), IsEncrypted = true });
        await _db.SaveChangesAsync();
        var store = new SettingsStore(new EphemeralDataProtectionProvider(), NullLogger<SettingsStore>.Instance);

        await store.ReloadAsync(_db, default);

        Assert.Null(store.Get("Email:ResendApiKey"));
    }
}
