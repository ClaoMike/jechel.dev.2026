namespace Portfolio.Api.Data;

/// <summary>An app on the Apps page (Features/Apps).</summary>
public class AppEntry
{
    public int Id { get; set; }
    public required string Title { get; set; }
    public required string Description { get; set; }

    /// <summary>The images and videos, in the order shown, as a JSON list of AppMedia.</summary>
    public required string Media { get; set; }

    /// <summary>Ids of its <see cref="AppCategory"/>s, as a JSON list.</summary>
    public string CategoryIds { get; set; } = "[]";

    /// <summary>What it runs on ("iOS", "Android"), as a JSON list of strings.</summary>
    public string Platforms { get; set; } = "[]";

    /// <summary>Where to get it, as a JSON list of AppLink.</summary>
    public string Links { get; set; } = "[]";

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
