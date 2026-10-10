namespace Portfolio.Api.Data;

/// <summary>An app on the Apps page (Features/Apps).</summary>
public class AppEntry
{
    public int Id { get; set; }
    public required string Title { get; set; }
    public required string Description { get; set; }

    /// <summary>The images and videos, in the order shown, as a JSON list of AppMedia.</summary>
    public required string Media { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
