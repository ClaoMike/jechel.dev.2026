using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;

namespace Portfolio.Api.Features.Support;

/// <summary>The "Support" configuration section: the header's "Buy me a coffee" button and the Ko-fi webhook.</summary>
public class SupportOptions
{
    public const string Section = "Support";

    /// <summary>Where the button goes, e.g. "https://ko-fi.com/jechel" (or a Buy Me a Coffee page). Empty hides it.</summary>
    public string Url { get; set; } = "";

    /// <summary>The token on Ko-fi's webhook page (a secret). Until it's set the webhook answers 503.</summary>
    public string KoFiVerificationToken { get; set; } = "";
}

/// <param name="Url">Empty when the button should be hidden.</param>
public record SupportInfo(string Url);

public record DonationDto(int Id, string Type, string FromName, string? Message, string Amount, string Currency, string? Email, bool IsPublic, DateTimeOffset ReceivedAt);

/// <summary>What Ko-fi posts (the JSON in the form's "data" field). Only the fields the site keeps.</summary>
public record KoFiPayment(
    [property: JsonPropertyName("verification_token")] string? VerificationToken,
    [property: JsonPropertyName("type")] string? Type,
    [property: JsonPropertyName("from_name")] string? FromName,
    [property: JsonPropertyName("message")] string? Message,
    [property: JsonPropertyName("amount")] string? Amount,
    [property: JsonPropertyName("currency")] string? Currency,
    [property: JsonPropertyName("email")] string? Email,
    [property: JsonPropertyName("is_public")] bool IsPublic,
    [property: JsonPropertyName("kofi_transaction_id")] string? TransactionId);

public static class SupportEndpoints
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 50;

    public static IEndpointRouteBuilder MapSupportEndpoints(this IEndpointRouteBuilder app)
    {
        var support = app.MapGroup("/support");

        support.MapGet("/", GetInfo).WithName("GetSupportInfo");
        // Called by Ko-fi, not the browser; checked with the verification token.
        support.MapPost("/kofi", KoFiWebhook).WithName("KoFiWebhook").DisableAntiforgery();
        support.MapGet("/donations", ListDonations).WithName("ListDonations").RequireAuthorization();

        return app;
    }

    /// <summary>Public. Where the "Buy me a coffee" button goes, or "" to hide it.</summary>
    public static Ok<SupportInfo> GetInfo(IOptions<SupportOptions> options) =>
        TypedResults.Ok(new SupportInfo(About.AboutRules.IsSafeUrl(options.Value.Url) && !options.Value.Url.Trim().StartsWith('/') ? options.Value.Url.Trim() : ""));

    /// <summary>
    /// Ko-fi's webhook: a form with one field, "data", holding the payment as JSON. Stores it once
    /// (Ko-fi retries until it gets a 200) and alerts the phone. 401 for a wrong token.
    /// </summary>
    public static async Task<Results<Ok, BadRequest, UnauthorizedHttpResult, ProblemHttpResult>> KoFiWebhook(
        HttpRequest request,
        PortfolioDbContext db,
        IOptions<SupportOptions> options,
        IPhoneAlerts alerts,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var expected = options.Value.KoFiVerificationToken.Trim();
        if (expected.Length == 0) return TypedResults.Problem("Ko-fi isn't set up: set Support:KoFiVerificationToken.", statusCode: StatusCodes.Status503ServiceUnavailable);
        if (!request.HasFormContentType) return TypedResults.BadRequest();

        var form = await request.ReadFormAsync(cancellationToken);
        var payment = ParseKoFi(form["data"].ToString());
        if (payment is null) return TypedResults.BadRequest();
        if (!TokensMatch(payment.VerificationToken, expected)) return TypedResults.Unauthorized();
        if (string.IsNullOrWhiteSpace(payment.TransactionId)) return TypedResults.BadRequest();

        var transactionId = Cut(payment.TransactionId.Trim(), 100)!;
        if (await db.Donations.AnyAsync(d => d.TransactionId == transactionId, cancellationToken)) return TypedResults.Ok();

        var donation = new Donation
        {
            TransactionId = transactionId,
            Type = Cut(payment.Type, 40) ?? "Donation",
            FromName = Cut(payment.FromName, 200) ?? "Someone",
            Message = Cut(payment.Message, 2000),
            Amount = Cut(payment.Amount, 20) ?? "",
            Currency = Cut(payment.Currency, 10) ?? "",
            Email = Cut(payment.Email, 320),
            IsPublic = payment.IsPublic,
            ReceivedAt = time.GetUtcNow(),
        };
        db.Donations.Add(donation);
        await db.SaveChangesAsync(cancellationToken);

        alerts.Send(new PhoneAlert(
            $"☕ {donation.Amount} {donation.Currency} from {donation.FromName}",
            donation.Message ?? $"A new {donation.Type.ToLowerInvariant()} on Ko-fi.",
            "/community",
            AlertPriority.High,
            "coffee"));
        return TypedResults.Ok();
    }

    /// <summary>Null when it isn't Ko-fi's JSON.</summary>
    public static KoFiPayment? ParseKoFi(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            return JsonSerializer.Deserialize<KoFiPayment>(json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>Compared in constant time, so the token can't be guessed a character at a time.</summary>
    public static bool TokensMatch(string? given, string expected) =>
        given is not null && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(given.Trim()), Encoding.UTF8.GetBytes(expected));

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
            .Select(d => new DonationDto(d.Id, d.Type, d.FromName, d.Message, d.Amount, d.Currency, d.Email, d.IsPublic, d.ReceivedAt))
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
