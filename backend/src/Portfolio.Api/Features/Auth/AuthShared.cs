namespace Portfolio.Api.Features.Auth;

/// <param name="SessionExpiresInSeconds">
/// Relative (not a timestamp) so the browser's clock doesn't matter.
/// </param>
public record CurrentUserResponse(string Email, string? Name, string? PictureUrl, int SessionExpiresInSeconds);

/// <param name="Count">How many devices were signed out.</param>
public record EndedSessions(int Count);

public static class AuthShared
{
    /// <summary>
    /// Only allow same-site relative paths, to prevent open redirects. Browsers drop tabs and line breaks from a
    /// URL and read "\\" as "/", so "/\t/evil.example" would become "//evil.example": no control characters, spaces
    /// or backslashes anywhere.
    /// </summary>
    public static string ToSafeReturnUrl(string? returnUrl) =>
        !string.IsNullOrEmpty(returnUrl) &&
        returnUrl.StartsWith('/') &&
        !returnUrl.StartsWith("//") &&
        !returnUrl.Any(c => char.IsControl(c) || char.IsWhiteSpace(c) || c == '\\')
            ? returnUrl
            : "/";
}
