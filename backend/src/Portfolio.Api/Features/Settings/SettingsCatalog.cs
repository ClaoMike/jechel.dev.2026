namespace Portfolio.Api.Features.Settings;

/// <summary>One setting the Settings tab can change.</summary>
/// <param name="Key">The configuration key it overrides, e.g. "Email:ResendApiKey".</param>
/// <param name="IsSecret">Stored encrypted; the browser only ever learns whether it's set and its last 4 characters.</param>
/// <param name="Kind">How it's checked: "text", "url", "email-sender" or "topic".</param>
public record SettingDefinition(string Key, string Label, bool IsSecret, string Kind = "text", int MaxLength = 500);

/// <summary>The settings the Settings tab can change, grouped by the service they connect to.</summary>
public static class SettingsCatalog
{
    public static readonly IReadOnlyList<SettingDefinition> All =
    [
        new("Support:Url", "Page link", IsSecret: false, Kind: "url"),
        new("Support:BuyMeACoffeeWebhookSecret", "Webhook secret", IsSecret: true),
        new("YouTube:Channel", "Channel (@handle or UC… id)", IsSecret: false, MaxLength: 100),
        new("YouTube:ApiKey", "API key", IsSecret: true),
        new("Email:ResendApiKey", "API key", IsSecret: true),
        new("Email:From", "Sender", IsSecret: false, Kind: "email-sender", MaxLength: 200),
        new("Email:UpdatesFrom", "Updates sender (no replies)", IsSecret: false, Kind: "email-sender", MaxLength: 200),
        // Shown to the admin, who types it into the ntfy app; it never reaches visitors.
        new("Alerts:NtfyTopic", "Topic", IsSecret: false, Kind: "topic", MaxLength: 64),
        new("Alerts:NtfyServer", "Server", IsSecret: false, Kind: "url"),
        new("Alerts:NtfyToken", "Access token (optional)", IsSecret: true),
        new("Cal:Link", "Booking page", IsSecret: false, Kind: "cal-link", MaxLength: 200),
        new("Cal:ApiKey", "API key", IsSecret: true),
        new("Cal:WebhookSecret", "Webhook secret", IsSecret: true),
    ];

    public static SettingDefinition? Find(string key) => All.FirstOrDefault(d => d.Key.Equals(key, StringComparison.OrdinalIgnoreCase));

    /// <summary>Null when the value is fine. An empty value is always fine: it clears the setting.</summary>
    public static string? Validate(SettingDefinition definition, string value)
    {
        if (value.Length == 0) return null;
        if (value.Length > definition.MaxLength) return $"At most {definition.MaxLength} characters.";
        return definition.Kind switch
        {
            "url" when !(Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme is "https" or "http") => "Enter an http(s) link.",
            "email-sender" when !IsSender(value) => "Enter an address, or a name and address like: jechel.dev <updates@jechel.dev>",
            "cal-link" when Meetings.CalOptions.NormalizeLink(value).Length == 0 => "Enter your Cal.com link, e.g. https://cal.com/you/30min or you/30min.",
            "topic" when !value.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_') => "Use letters, digits, - and _ only.",
            _ => null,
        };
    }

    private static bool IsSender(string value)
    {
        var open = value.LastIndexOf('<');
        var address = open >= 0 && value.EndsWith('>') ? value[(open + 1)..^1] : value;
        return Contact.ContactRules.IsEmail(address.Trim());
    }
}
