using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using static Portfolio.Api.Features.Support.SupportShared;

namespace Portfolio.Api.Features.Support;

/// <summary>
/// Buy Me a Coffee's webhook. The body is signed: an HMAC-SHA256 of it with the webhook's secret,
/// in hex, in X-Signature-Sha256 (or X-Bmc-Signature, as older webhooks did). Stores each event on a
/// payment once (a coffee, then its refund, are two) and alerts the phone, saying what happened. Its
/// JSON isn't well documented, so the common field names are read and the whole body is kept.
/// </summary>
public sealed class BuyMeACoffeeWebhook : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/support").MapPost("/buymeacoffee", Handle).WithName("BuyMeACoffeeWebhook");

    public static async Task<Results<Ok, BadRequest, UnauthorizedHttpResult, ProblemHttpResult>> Handle(
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
}
