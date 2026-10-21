namespace Portfolio.Api.Data;

/// <summary>
/// The wording of the emails subscribers get, as one JSON document (see Features/Updates/UpdateEmailWording.cs),
/// read and saved as a whole. There is only ever one row; until the admin saves it, the defaults apply.
/// </summary>
public class UpdateEmailsPage
{
    public const int SingletonId = 1;

    public int Id { get; set; }
    public required string Content { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
