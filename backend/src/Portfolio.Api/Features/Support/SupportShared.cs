using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Portfolio.Api.Features.Alerts;

namespace Portfolio.Api.Features.Support;

/// <summary>The "Support" configuration section (also editable in the Settings tab): the header's "Buy me a coffee" button and its webhook.</summary>
public class SupportOptions
{
    public const string Section = "Support";

    /// <summary>Where the button goes, e.g. "https://buymeacoffee.com/claomike". Empty hides it.</summary>
    public string Url { get; set; } = "";

    /// <summary>The secret Buy Me a Coffee shows for the webhook. Until it's set the webhook answers 503.</summary>
    public string BuyMeACoffeeWebhookSecret { get; set; } = "";
}

/// <param name="Url">Empty when the button should be hidden.</param>
public record SupportInfo(string Url);

/// <param name="Type">The event, e.g. "donation.created", "donation.refunded", "membership.started".</param>
/// <param name="IsTest">Sent with Buy Me a Coffee's "Send test": no money moved.</param>
public record DonationDto(int Id, string Type, string FromName, string? Message, string Amount, string Currency, string? Email, DateTimeOffset ReceivedAt, bool IsTest);

/// <summary>What the site reads from a webhook's JSON.</summary>
/// <param name="LiveMode">False for a test event; null when the body doesn't say (older webhooks).</param>
public record ParsedDonation(string? Id, string? Type, string? FromName, string? Message, string? Amount, string? Currency, string? Email, bool? LiveMode = null);

public static class SupportShared
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 50;
    public const int MaxPayloadBytes = 64 * 1024;

    /// <summary>An http(s) link, or "".</summary>
    public static string SafeUrl(string value)
    {
        var url = value.Trim();
        return Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme is "https" or "http" ? url : "";
    }

    /// <summary>The phone alert for an event: what happened, for how much, from whom. A test says so, quietly.</summary>
    public static PhoneAlert AlertFor(Donation donation)
    {
        var amount = $"{donation.Amount} {donation.Currency}".Trim();
        var from = donation.FromName;
        var (title, message, priority, tag) = donation.Type switch
        {
            "donation.refunded" => ($"Refunded: {Join(amount, "to", from)}", "A coffee was refunded on Buy Me a Coffee.", AlertPriority.Default, "leftwards_arrow_with_hook"),
            "membership.started" => ($"⭐ New member: {from}", donation.Message ?? (amount.Length > 0 ? $"{amount} a month." : "A membership started."), AlertPriority.High, "star"),
            "membership.updated" => ($"Membership changed: {from}", amount.Length > 0 ? $"Now {amount}." : "A membership changed.", AlertPriority.Default, "star"),
            "membership.cancelled" => ($"Membership cancelled: {from}", "They won't be charged again.", AlertPriority.Default, "star"),
            "extra_purchase.created" => ($"🛍️ {Join(amount, "from", from)}", donation.Message ?? "Someone bought an extra.", AlertPriority.High, "shopping_bags"),
            _ when donation.Type.StartsWith("donation") || donation.Type.Contains("coffee") =>
                (amount.Length > 0 ? $"☕ {amount} from {from}" : $"☕ {from} bought you a coffee", donation.Message ?? "No message.", AlertPriority.High, "coffee"),
            _ => ($"Buy Me a Coffee: {from}", $"New event: {donation.Type}{(amount.Length > 0 ? $", {amount}" : "")}.", AlertPriority.Default, "coffee"),
        };
        return donation.IsTest
            ? new PhoneAlert(AlertKinds.Coffee, $"Test: {title}", $"{message} (Sent with Send test: no money moved.)", "/community", AlertPriority.Low, tag)
            : new PhoneAlert(AlertKinds.Coffee, title, message, "/community", priority, tag);
    }

    /// <summary>"5 GBP from Jo", or just "Jo" without an amount.</summary>
    internal static string Join(string amount, string word, string name) => amount.Length > 0 ? $"{amount} {word} {name}" : name;

    /// <summary>The HMAC-SHA256 of the body with the secret, as hex (any case), compared in constant time.</summary>
    public static bool SignatureMatches(byte[] body, string? signature, string secret)
    {
        if (string.IsNullOrWhiteSpace(signature)) return false;
        var expected = Convert.ToHexStringLower(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), body));
        var given = signature.Trim().ToLowerInvariant();
        if (given.StartsWith("sha256=")) given = given[7..];
        return CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(given));
    }

    /// <summary>
    /// Reads a webhook body. Newer ones look like { "type": "donation.created", "data": { … } }, older
    /// ones { "response": { … } } with the event in the X-Bmc-Event header. Null when it isn't a JSON object.
    /// </summary>
    public static ParsedDonation? ParseBuyMeACoffee(string json, string? eventHeader = null)
    {
        JsonObject? root;
        try
        {
            root = JsonNode.Parse(json) as JsonObject;
        }
        catch (JsonException)
        {
            return null;
        }
        if (root is null) return null;

        var data = root["data"] as JsonObject ?? root["response"] as JsonObject ?? root;
        string? Read(params string[] names) => names.Select(n => Text(data[n]) ?? Text(root[n])).FirstOrDefault(v => v is { Length: > 0 });
        // The newer shape's "message" is Buy Me a Coffee's own line ("Jo bought you a coffee"), not the supporter's words.
        var newer = root["data"] is JsonObject;

        return new ParsedDonation(
            Read("id", "support_id", "transaction_id", "event_id"),
            Text(root["type"]) ?? eventHeader,
            Read("supporter_name", "payer_name", "name"),
            newer ? Read("support_note", "note") : Read("support_note", "note", "message"),
            Read("amount", "total_amount", "support_coffee_price"),
            Read("currency", "support_currency"),
            Read("supporter_email", "payer_email", "email"),
            root["live_mode"] is JsonValue live && live.TryGetValue<bool>(out var isLive) ? isLive : null);
    }

    /// <summary>A string or a number as text; null for anything else.</summary>
    internal static string? Text(JsonNode? node) => node is JsonValue value
        ? value.TryGetValue<string>(out var s) ? s.Trim() : value.TryGetValue<decimal>(out var d) ? d.ToString(System.Globalization.CultureInfo.InvariantCulture) : null
        : null;

    internal static string? Cut(string? text, int max)
    {
        var trimmed = text?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return null;
        return trimmed.Length <= max ? trimmed : trimmed[..max];
    }
}
