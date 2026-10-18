namespace Portfolio.Api.Data;

/// <summary>
/// One row: what visitors can see (each page, and features that need setting up once live), and
/// whether the site is under maintenance. Edited in the Settings tab.
/// </summary>
public class SiteState
{
    public const int SingletonId = 1;

    public int Id { get; set; }

    /// <summary>JSON object: page id → shown to visitors. A page missing from it uses the default (Site:PagesVisibleByDefault).</summary>
    public string Pages { get; set; } = "{}";

    /// <summary>JSON object: feature id → offered to visitors; like <see cref="Pages"/>.</summary>
    public string Features { get; set; } = "{}";

    public bool MaintenanceEnabled { get; set; }

    /// <summary>Shown on the maintenance screen, e.g. "Back at 18:00". Optional.</summary>
    public string MaintenanceMessage { get; set; } = "";

    public DateTimeOffset UpdatedAt { get; set; }
}
