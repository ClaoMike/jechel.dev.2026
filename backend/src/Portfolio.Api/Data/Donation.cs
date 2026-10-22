namespace Portfolio.Api.Data;

/// <summary>A payment Buy Me a Coffee told the site about through its webhook: a donation, a membership, an extra, ….</summary>
public class Donation
{
    public int Id { get; set; }

    /// <summary>
    /// The event and the service's id for the payment, e.g. "donation.created:58" (or a hash of the payload); unique, so a retried
    /// webhook is stored once, while a refund or a membership change (same payment id, another event) is stored too.
    /// </summary>
    public required string TransactionId { get; set; }

    /// <summary>The event, e.g. "donation.created".</summary>
    public required string Type { get; set; }

    public required string FromName { get; set; }

    /// <summary>Their message, if they left one.</summary>
    public string? Message { get; set; }

    /// <summary>As the service sent it, e.g. "3.00".</summary>
    public required string Amount { get; set; }

    /// <summary>E.g. "GBP".</summary>
    public required string Currency { get; set; }

    /// <summary>Only set when the service sends it; only the admin sees it.</summary>
    public string? Email { get; set; }

    /// <summary>The webhook's body as received (JSON, cut at 20,000 characters), to see everything the service sent.</summary>
    public string? Payload { get; set; }

    public DateTimeOffset ReceivedAt { get; set; }

    /// <summary>Sent with Buy Me a Coffee's "Send test" (live_mode false): no money moved.</summary>
    public bool IsTest { get; set; }
}
