namespace Portfolio.Api.Data;

/// <summary>
/// A connection setting the admin saved in the Settings tab, e.g. the Resend API key. It overrides
/// the same key in the configuration (appsettings, user secrets, environment). Secrets are stored
/// encrypted with ASP.NET Core Data Protection and never sent back to the browser.
/// </summary>
public class SiteSetting
{
    /// <summary>The configuration key it overrides, e.g. "Email:ResendApiKey".</summary>
    public required string Key { get; set; }

    /// <summary>Encrypted when <see cref="IsEncrypted"/>.</summary>
    public required string Value { get; set; }

    public bool IsEncrypted { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
