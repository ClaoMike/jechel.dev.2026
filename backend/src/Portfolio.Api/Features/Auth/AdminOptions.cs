namespace Portfolio.Api.Features.Auth;

public class AdminOptions
{
    public const string SectionName = "Auth";

    /// <summary>
    /// Google accounts allowed to sign in. Anyone else is rejected at the Google callback,
    /// and existing sessions are revoked if their email is removed from this list.
    /// </summary>
    public string[] AdminEmails { get; set; } = [];

    /// <summary>A session ends after this long without any request from the admin.</summary>
    public TimeSpan SessionIdleTimeout { get; set; } = TimeSpan.FromMinutes(10);

    public bool IsAdmin(string? email) =>
        !string.IsNullOrWhiteSpace(email) &&
        AdminEmails.Contains(email.Trim(), StringComparer.OrdinalIgnoreCase);
}
