using System.Security.Cryptography;
using System.Text;
using System.Xml.Linq;
using Microsoft.AspNetCore.DataProtection.XmlEncryption;

namespace Portfolio.Api;

/// <summary>
/// Encrypts the Data Protection keys (which encrypt the sign-in cookie and the secrets saved in Settings)
/// before they're stored in the database, with AES-256-GCM under <c>DataProtection:KeyEncryptionKey</c>
/// (base64, 32 bytes: <c>openssl rand -base64 32</c>). Someone who can read the database then still can't
/// read those secrets. Without the setting (locally), keys are stored as they are. Losing the setting
/// means losing the keys: everyone is signed out and the secrets in Settings must be entered again.
/// </summary>
public static class KeyRingEncryption
{
    public const string ConfigurationKey = "DataProtection:KeyEncryptionKey";

    /// <summary>The 32-byte key from configuration, or null when it isn't set. Throws when it's set but not 32 bytes of base64.</summary>
    public static byte[]? KeyFrom(IConfiguration configuration)
    {
        var text = configuration[ConfigurationKey];
        if (string.IsNullOrWhiteSpace(text)) return null;
        try
        {
            var key = Convert.FromBase64String(text.Trim());
            if (key.Length == 32) return key;
        }
        catch (FormatException)
        {
        }
        throw new InvalidOperationException($"{ConfigurationKey} must be 32 bytes in base64 (openssl rand -base64 32).");
    }

    private const int NonceSize = 12;
    private const int TagSize = 16;

    public static byte[] Seal(byte[] key, byte[] plaintext)
    {
        var sealed_ = new byte[NonceSize + TagSize + plaintext.Length];
        var nonce = sealed_.AsSpan(0, NonceSize);
        RandomNumberGenerator.Fill(nonce);
        using var aes = new AesGcm(key, TagSize);
        aes.Encrypt(nonce, plaintext, sealed_.AsSpan(NonceSize + TagSize), sealed_.AsSpan(NonceSize, TagSize));
        return sealed_;
    }

    public static byte[] Open(byte[] key, byte[] sealed_)
    {
        var plaintext = new byte[sealed_.Length - NonceSize - TagSize];
        using var aes = new AesGcm(key, TagSize);
        aes.Decrypt(sealed_.AsSpan(0, NonceSize), sealed_.AsSpan(NonceSize + TagSize), sealed_.AsSpan(NonceSize, TagSize), plaintext);
        return plaintext;
    }
}

/// <summary>Seals a key's secret part (Data Protection hands over only that element).</summary>
public sealed class KeyRingEncryptor(byte[] key) : IXmlEncryptor
{
    public EncryptedXmlInfo Encrypt(XElement plaintextElement)
    {
        var plaintext = Encoding.UTF8.GetBytes(plaintextElement.ToString(SaveOptions.DisableFormatting));
        var element = new XElement("encryptedKey",
            new XComment(" AES-256-GCM under DataProtection:KeyEncryptionKey "),
            new XElement("value", Convert.ToBase64String(KeyRingEncryption.Seal(key, plaintext))));
        return new EncryptedXmlInfo(element, typeof(KeyRingDecryptor));
    }
}

/// <summary>Opens what <see cref="KeyRingEncryptor"/> sealed. Data Protection creates it by name (from the stored key), with the app's services.</summary>
public sealed class KeyRingDecryptor(IServiceProvider services) : IXmlDecryptor
{
    public XElement Decrypt(XElement encryptedElement)
    {
        var key = KeyRingEncryption.KeyFrom(services.GetRequiredService<IConfiguration>())
            ?? throw new InvalidOperationException($"This key was encrypted, but {KeyRingEncryption.ConfigurationKey} isn't set.");
        var sealed_ = Convert.FromBase64String(encryptedElement.Element("value")?.Value ?? "");
        return XElement.Parse(Encoding.UTF8.GetString(KeyRingEncryption.Open(key, sealed_)));
    }
}
