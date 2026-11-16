using System.Xml.Linq;
using Microsoft.AspNetCore.DataProtection.XmlEncryption;

// Deliberately not Portfolio.Api.Common: this is the decryptor's name before it moved there.
namespace Portfolio.Api;

/// <summary>
/// The name <see cref="Common.KeyRingDecryptor"/> had before it moved to Portfolio.Api.Common. Every Data Protection key
/// stores the full name of the type that opens it (decryptorType="Portfolio.Api.KeyRingDecryptor, Portfolio.Api"), so the
/// keys made before the move still ask for this one. Without it none of them can be read: every secret saved in Settings
/// is lost and everyone is signed out. Never rename or move it, nor <see cref="Common.KeyRingDecryptor"/>; if either
/// has to move, leave a class like this one under the old name. Internal, so it doesn't hide the real one from code in
/// other assemblies (Data Protection finds it by name either way).
/// </summary>
internal sealed class KeyRingDecryptor(IServiceProvider services) : IXmlDecryptor
{
    public XElement Decrypt(XElement encryptedElement) => new Common.KeyRingDecryptor(services).Decrypt(encryptedElement);
}
