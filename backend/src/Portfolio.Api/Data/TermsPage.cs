namespace Portfolio.Api.Data;

/// <summary>
/// The terms and conditions, as one JSON document (see Features/Terms/TermsContent.cs), read and
/// saved as a whole. There is only ever one row.
/// </summary>
public class TermsPage
{
    public const int SingletonId = 1;

    public int Id { get; set; }
    public required string Content { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
