namespace Portfolio.Api.Data;

/// <summary>A kind of app the admin defined, e.g. "Video game" (Features/Apps).</summary>
public class AppCategory
{
    public int Id { get; set; }
    public required string Name { get; set; }

    /// <summary>Categories are listed by this, then shown on apps in the same order.</summary>
    public int Position { get; set; }
}
