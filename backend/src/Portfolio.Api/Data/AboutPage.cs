namespace Portfolio.Api.Data;

/// <summary>
/// The About Me page, as one JSON document (see Features/About/AboutContent.cs): it's read and
/// saved as a whole, and its shape is expected to keep changing. There is only ever one row.
/// </summary>
public class AboutPage
{
    public const int SingletonId = 1;

    public int Id { get; set; }
    public required string Content { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
