using System.Security.Cryptography;
using System.Xml.Linq;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Portfolio.Api.Common;
using Portfolio.Api.Data;

namespace Portfolio.Api.UnitTests.Features.Auth;

/// <summary>The Data Protection keys encrypted before they're stored (KeyRingEncryption).</summary>
public class KeyRingEncryptionTests
{
    private static readonly string Key = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));

    private static IConfiguration Settings(string? key) =>
        new ConfigurationBuilder().AddInMemoryCollection([new(KeyRingEncryption.ConfigurationKey, key)]).Build();

    /// <summary>Data Protection as the API sets it up, keys in an in-memory database.</summary>
    private static ServiceProvider DataProtection(string database, string? key)
    {
        var configuration = Settings(key);
        var services = new ServiceCollection()
            .AddSingleton(configuration)
            .AddDbContext<PortfolioDbContext>(o => o.UseInMemoryDatabase(database));
        var builder = services.AddDataProtection().SetApplicationName("test").PersistKeysToDbContext<PortfolioDbContext>();
        if (KeyRingEncryption.KeyFrom(configuration) is { } encryptionKey)
        {
            builder.AddKeyManagementOptions(o => o.XmlEncryptor = new KeyRingEncryptor(encryptionKey));
        }
        return services.BuildServiceProvider();
    }

    private static List<string> StoredKeys(ServiceProvider services)
    {
        using var scope = services.CreateScope();
        return [.. scope.ServiceProvider.GetRequiredService<PortfolioDbContext>().DataProtectionKeys.Select(k => k.Xml!)];
    }

    [Fact]
    public void Stores_the_keys_encrypted_and_still_reads_them_after_a_restart()
    {
        var database = Guid.NewGuid().ToString();
        using var first = DataProtection(database, Key);
        var secret = first.GetRequiredService<IDataProtectionProvider>().CreateProtector("test").Protect("the Resend key");

        var stored = Assert.Single(StoredKeys(first));
        Assert.Contains("encryptedKey", stored);
        Assert.DoesNotContain("<masterKey", stored);

        using var restarted = DataProtection(database, Key);
        Assert.Equal("the Resend key", restarted.GetRequiredService<IDataProtectionProvider>().CreateProtector("test").Unprotect(secret));
    }

    [Fact]
    public void Without_the_setting_stores_them_as_they_are()
    {
        using var services = DataProtection(Guid.NewGuid().ToString(), null);
        services.GetRequiredService<IDataProtectionProvider>().CreateProtector("test").Protect("x");

        Assert.Contains("<masterKey", Assert.Single(StoredKeys(services)));
    }

    [Fact]
    public void Cant_read_encrypted_keys_without_the_right_setting()
    {
        var database = Guid.NewGuid().ToString();
        using var first = DataProtection(database, Key);
        var secret = first.GetRequiredService<IDataProtectionProvider>().CreateProtector("test").Protect("the Resend key");

        using var otherKey = DataProtection(database, Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)));
        Assert.ThrowsAny<CryptographicException>(() => otherKey.GetRequiredService<IDataProtectionProvider>().CreateProtector("test").Unprotect(secret));
    }

    [Fact]
    public void Seals_with_a_fresh_nonce_each_time_and_notices_tampering()
    {
        var key = RandomNumberGenerator.GetBytes(32);
        var plaintext = "<masterKey>secret</masterKey>"u8.ToArray();

        var once = KeyRingEncryption.Seal(key, plaintext);
        var twice = KeyRingEncryption.Seal(key, plaintext);

        Assert.NotEqual(once, twice);
        Assert.Equal(plaintext, KeyRingEncryption.Open(key, once));
        once[^1] ^= 1;
        Assert.ThrowsAny<CryptographicException>(() => KeyRingEncryption.Open(key, once));
    }

    [Fact]
    public void Round_trips_an_element()
    {
        var key = RandomNumberGenerator.GetBytes(32);
        var element = new XElement("masterKey", new XAttribute("version", "1"), new XElement("value", "c2VjcmV0"));
        var services = new ServiceCollection().AddSingleton(Settings(Convert.ToBase64String(key))).BuildServiceProvider();

        var encrypted = new KeyRingEncryptor(key).Encrypt(element);

        Assert.Equal(typeof(KeyRingDecryptor), encrypted.DecryptorType);
        Assert.Equal(element.ToString(), new KeyRingDecryptor(services).Decrypt(encrypted.EncryptedElement).ToString());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Is_off_when_the_setting_is_empty(string? key) => Assert.Null(KeyRingEncryption.KeyFrom(Settings(key)));

    [Fact]
    public void Takes_the_key_however_it_was_pasted()
    {
        var key = RandomNumberGenerator.GetBytes(32);
        var base64 = Convert.ToBase64String(key);

        foreach (var pasted in new[] { base64, $" {base64} ", $"\"{base64}\"", $"'{base64}'", base64.TrimEnd('='), base64.Replace('+', '-').Replace('/', '_') })
        {
            Assert.Equal(key, KeyRingEncryption.KeyFrom(Settings(pasted)));
        }
    }

    [Fact]
    public void Says_how_long_a_wrong_key_is_but_never_shows_it()
    {
        var error = Assert.Throws<InvalidOperationException>(() => KeyRingEncryption.KeyFrom(Settings("c2hvcnQ=")));

        Assert.Contains("it's 5 bytes", error.Message);
        Assert.DoesNotContain("c2hvcnQ", error.Message);
    }

    [Theory]
    [InlineData("not base64!")]
    [InlineData("c2hvcnQ=")]
    public void Refuses_a_setting_that_isnt_32_bytes_of_base64(string key)
    {
        var error = Assert.Throws<InvalidOperationException>(() => KeyRingEncryption.KeyFrom(Settings(key)));
        Assert.Contains("openssl rand -base64 32", error.Message);
    }

    [Fact]
    public void Says_so_when_a_key_is_encrypted_but_the_setting_is_gone()
    {
        var key = RandomNumberGenerator.GetBytes(32);
        var encrypted = new KeyRingEncryptor(key).Encrypt(new XElement("masterKey"));
        var services = new ServiceCollection().AddSingleton(Settings(null)).BuildServiceProvider();

        var error = Assert.Throws<InvalidOperationException>(() => new KeyRingDecryptor(services).Decrypt(encrypted.EncryptedElement));
        Assert.Contains(KeyRingEncryption.ConfigurationKey, error.Message);
    }

    [Fact]
    public void An_encrypted_key_without_its_value_cant_be_opened()
    {
        var key = RandomNumberGenerator.GetBytes(32);
        var services = new ServiceCollection().AddSingleton(Settings(Convert.ToBase64String(key))).BuildServiceProvider();

        Assert.ThrowsAny<Exception>(() => new KeyRingDecryptor(services).Decrypt(new XElement("encryptedKey")));
    }
}
