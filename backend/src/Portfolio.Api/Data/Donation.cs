namespace Portfolio.Api.Data;

/// <summary>A payment Ko-fi told the site about through its webhook: a donation, a membership payment, a shop order, ….</summary>
public class Donation
{
    public int Id { get; set; }

    /// <summary>Ko-fi's id for the payment; unique, so a webhook Ko-fi retries is stored once.</summary>
    public required string TransactionId { get; set; }

    /// <summary>"Donation", "Subscription", "Shop Order" or "Commission".</summary>
    public required string Type { get; set; }

    public required string FromName { get; set; }

    /// <summary>Their message, if they left one.</summary>
    public string? Message { get; set; }

    /// <summary>As Ko-fi sent it, e.g. "3.00".</summary>
    public required string Amount { get; set; }

    /// <summary>E.g. "GBP".</summary>
    public required string Currency { get; set; }

    /// <summary>Only set when the supporter shared it with Ko-fi; only the admin sees it.</summary>
    public string? Email { get; set; }

    /// <summary>The supporter chose to make it public on Ko-fi.</summary>
    public bool IsPublic { get; set; }

    public DateTimeOffset ReceivedAt { get; set; }
}
