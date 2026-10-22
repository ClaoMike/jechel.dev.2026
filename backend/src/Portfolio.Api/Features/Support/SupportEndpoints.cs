using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;
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

public static class SupportEndpoints
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 50;
    public const int MaxPayloadBytes = 64 * 1024;

    public static IEndpointRouteBuilder MapSupportEndpoints(this IEndpointRouteBuilder app)
    {
        var support = app.MapGroup("/support");

        support.MapGet("/", GetInfo).WithName("GetSupportInfo");
        // Called by Buy Me a Coffee, not the browser; checked with the webhook's signature.
        support.MapPost("/buymeacoffee", BuyMeACoffeeWebhook).WithName("BuyMeACoffeeWebhook");
        support.MapGet("/donations", ListDonations).WithName("ListDonations").RequireAuthorization();

        return app;
    }

    /// <summary>Public. Where the "Buy me a coffee" button goes, or "" to hide it (no page set, or switched off in Settings).</summary>
    public static async Task<Ok<SupportInfo>> GetInfo(IOptionsMonitor<SupportOptions> options, Microsoft.Extensions.Caching.Hybrid.HybridCache cache, IServiceProvider services, CancellationToken cancellationToken)
    {
        var site = await Site.SiteEndpoints.LoadAsync(cache, services, cancellationToken);
        return TypedResults.Ok(new SupportInfo(site.Features["coffee"] ? SafeUrl(options.CurrentValue.Url) : ""));
    }

    /// <summary>An http(s) link, or "".</summary>
    public static string SafeUrl(string value)
    {
        var url = value.Trim();
        return Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme is "https" or "http" ? url : "";
    }

    /// <summary>
    /// Buy Me a Coffee's webhook. The body is signed: an HMAC-SHA256 of it with the webhook's secret,
    /// in hex, in X-Signature-Sha256 (or X-Bmc-Signature, as older webhooks did). Stores each event on a
    /// payment once (a coffee, then its refund, are two) and alerts the phone, saying what happened. Its
    /// JSON isn't well documented, so the common field names are read and the whole body is kept.
    /// </summary>
    public static async Task<Results<Ok, BadRequest, UnauthorizedHttpResult, ProblemHttpResult>> BuyMeACoffeeWebhook(
        HttpRequest request,
        PortfolioDbContext db,
        IOptionsMonitor<SupportOptions> options,
        IPhoneAlerts alerts,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var secret = options.CurrentValue.BuyMeACoffeeWebhookSecret.Trim();
        if (secret.Length == 0) return TypedResults.Problem("Buy Me a Coffee isn't set up: set its webhook secret in Settings.", statusCode: StatusCodes.Status503ServiceUnavailable);
        if (await RequestBodies.ReadLimitedAsync(request, MaxPayloadBytes, cancellationToken) is not { } body) return TypedResults.BadRequest();

        var signature = request.Headers["X-Signature-Sha256"].FirstOrDefault() ?? request.Headers["X-Bmc-Signature"].FirstOrDefault();
        if (!SignatureMatches(body, signature, secret)) return TypedResults.Unauthorized();

        var json = Encoding.UTF8.GetString(body);
        var parsed = ParseBuyMeACoffee(json, request.Headers["X-Bmc-Event"].FirstOrDefault());
        if (parsed is null) return TypedResults.BadRequest();

        var type = Cut(parsed.Type, 40) ?? "donation";
        var transactionId = parsed.Id is { Length: > 0 } id ? Cut($"{type}:{id}", 100)! : Convert.ToHexStringLower(SHA256.HashData(body));
        if (await db.Donations.AnyAsync(d => d.TransactionId == transactionId, cancellationToken)) return TypedResults.Ok();

        var donation = new Donation
        {
            TransactionId = transactionId,
            Type = type,
            FromName = Cut(parsed.FromName, 200) ?? "Someone",
            Message = Cut(parsed.Message, 2000),
            Amount = Cut(parsed.Amount, 20) ?? "",
            Currency = Cut(parsed.Currency, 10) ?? "",
            Email = Cut(parsed.Email, 320),
            Payload = json.Length <= 20_000 ? json : json[..20_000],
            ReceivedAt = time.GetUtcNow(),
            IsTest = parsed.LiveMode == false,
        };
        db.Donations.Add(donation);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException e) when (e.InnerException is Npgsql.PostgresException { SqlState: Npgsql.PostgresErrorCodes.UniqueViolation })
        {
            // The same event delivered twice at once (a retry): the other request stored it and rang the phone.
            return TypedResults.Ok();
        }

        alerts.Send(AlertFor(donation));
        return TypedResults.Ok();
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
    private static string Join(string amount, string word, string name) => amount.Length > 0 ? $"{amount} {word} {name}" : name;

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
    private static string? Text(JsonNode? node) => node is JsonValue value
        ? value.TryGetValue<string>(out var s) ? s.Trim() : value.TryGetValue<decimal>(out var d) ? d.ToString(System.Globalization.CultureInfo.InvariantCulture) : null
        : null;

    /// <summary>Admin only. Newest first.</summary>
    public static async Task<Ok<PagedResponse<DonationDto>>> ListDonations(
        PortfolioDbContext db,
        CancellationToken cancellationToken,
        int page = 1,
        int pageSize = DefaultPageSize)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var totalCount = await db.Donations.CountAsync(cancellationToken);
        var items = await db.Donations
            .AsNoTracking()
            .OrderByDescending(d => d.ReceivedAt)
            .ThenByDescending(d => d.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(d => new DonationDto(d.Id, d.Type, d.FromName, d.Message, d.Amount, d.Currency, d.Email, d.ReceivedAt, d.IsTest))
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(new PagedResponse<DonationDto>(items, page, pageSize, totalCount));
    }

    private static string? Cut(string? text, int max)
    {
        var trimmed = text?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return null;
        return trimmed.Length <= max ? trimmed : trimmed[..max];
    }
}
