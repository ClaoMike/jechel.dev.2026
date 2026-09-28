namespace Portfolio.Api.Features.Auth;

/// <summary>
/// Google accounts allowed to sign in. Anyone else is rejected at the Google callback,
/// and existing sessions are revoked if their email is removed from this list.
/// </summary>
public class AdminOptions
{
    public const string SectionName = "Auth";

    public string[] AdminEmails { get; set; } = [];

    public bool IsAdmin(string? email) =>
        !string.IsNullOrWhiteSpace(email) &&
        AdminEmails.Contains(email.Trim(), StringComparer.OrdinalIgnoreCase);
}
