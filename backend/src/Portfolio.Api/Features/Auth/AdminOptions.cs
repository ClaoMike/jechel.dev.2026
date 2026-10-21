namespace Portfolio.Api.Features.Auth;

public class AdminOptions
{
    public const string SectionName = "Auth";

    /// <summary>
    /// Google accounts allowed to sign in. Anyone else is rejected at the Google callback,
    /// and existing sessions are revoked if their email is removed from this list.
    /// </summary>
    public string[] AdminEmails { get; set; } = [];

    /// <summary>
    /// Optional: the Google accounts' permanent ids ("sub", e.g. "110248495921238986420"). When set, an
    /// account must have one of these as well as an allowed email: an email address can change hands, the
    /// id can't. Empty: the email alone decides.
    /// </summary>
    public string[] AdminGoogleIds { get; set; } = [];

    /// <summary>A session ends after this long without any request from its device.</summary>
    public TimeSpan SessionIdleTimeout { get; set; } = TimeSpan.FromMinutes(10);

    /// <summary>A session ends this long after signing in, however active: then it's Google again.</summary>
    public TimeSpan SessionMaxLifetime { get; set; } = TimeSpan.FromHours(12);

    public bool IsAdmin(string? email, string? googleId) =>
        !string.IsNullOrWhiteSpace(email) &&
        AdminEmails.Contains(email.Trim(), StringComparer.OrdinalIgnoreCase) &&
        (AdminGoogleIds.Length == 0 || (!string.IsNullOrWhiteSpace(googleId) && AdminGoogleIds.Contains(googleId.Trim(), StringComparer.Ordinal)));
}
