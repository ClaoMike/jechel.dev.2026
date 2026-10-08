namespace Portfolio.Api.Data;

public class Profile
{
    public int Id { get; set; }
    public required string FirstName { get; set; }

    /// <summary>
    /// SHA-256 (hex) of the admin's current session token. There is a single admin, so a single
    /// session: signing in replaces it (ending sessions elsewhere), signing out clears it.
    /// </summary>
    public string? SessionTokenHash { get; set; }

    /// <summary>When the admin session expires unless extended by activity.</summary>
    public DateTimeOffset? SessionExpiresAt { get; set; }
}
