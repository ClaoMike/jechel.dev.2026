namespace Portfolio.Api.Data;

/// <summary>A phone alert the site raised, sent or not (its kind switched off, nowhere set up to send it, or it failed): the Notifications tab's history.</summary>
public class PhoneAlertLog
{
    public long Id { get; set; }

    /// <summary>One of Features.Alerts.AlertKinds.</summary>
    public required string Kind { get; set; }

    public required string Title { get; set; }
    public required string Message { get; set; }

    /// <summary>Where tapping it went on the site, e.g. "/contact".</summary>
    public string? Path { get; set; }

    /// <summary>One of <see cref="Features.Alerts.AlertStatus"/>.</summary>
    public required string Status { get; set; }

    /// <summary>Where it went, once sent: Features.Alerts.AlertChannels, comma-separated (e.g. "ntfy,push"); null when it wasn't.</summary>
    public string? SentTo { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>A kind of phone alert switched on or off in the Notifications tab. A kind without a row is on.</summary>
public class AlertPreference
{
    /// <summary>One of Features.Alerts.AlertKinds.</summary>
    public required string Kind { get; set; }

    public bool Enabled { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
