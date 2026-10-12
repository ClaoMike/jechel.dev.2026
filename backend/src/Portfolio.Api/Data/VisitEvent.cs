namespace Portfolio.Api.Data;

/// <summary>Something that happened during a visit: a page opened, a click, an error… (see Features/Analytics/AnalyticsRules.cs).</summary>
public class VisitEvent
{
    public long Id { get; set; }
    public Guid SessionId { get; set; }

    /// <summary>The browser's counter within the visit (from 1): orders the events, and makes a batch sent twice harmless.</summary>
    public int Sequence { get; set; }

    public DateTimeOffset OccurredAt { get; set; }

    /// <summary>One of <see cref="Features.Analytics.AnalyticsRules.EventTypes"/>.</summary>
    public required string Type { get; set; }

    /// <summary>The page it happened on.</summary>
    public required string Path { get; set; }

    /// <summary>What it was about: the button's text, the error message, the event name.</summary>
    public string? Label { get; set; }

    /// <summary>A JSON object of strings, e.g. an error's stack, or a link's address. Null when there's nothing more.</summary>
    public string? Detail { get; set; }
}
