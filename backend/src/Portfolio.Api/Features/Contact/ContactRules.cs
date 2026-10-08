using System.Net.Mail;

namespace Portfolio.Api.Features.Contact;

/// <summary>
/// Validation rules of the contact form. The frontend mirrors them (ContactForm.tsx) for instant
/// feedback; these are the ones that count. Lengths are measured after trimming.
/// </summary>
public static class ContactRules
{
    public const int NameMaxLength = 100;
    public const int EmailMaxLength = 254;
    public const int MessageMinLength = 100;
    public const int MessageMaxLength = 1000;

    /// <summary>Errors keyed by the (camelCase) JSON field name; empty when the request is valid.</summary>
    public static Dictionary<string, string[]> Validate(SendMessageRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        var name = request.Name?.Trim() ?? "";
        var email = request.Email?.Trim() ?? "";
        var message = request.Message?.Trim() ?? "";

        if (name.Length == 0)
            errors["name"] = ["Name is required."];
        else if (name.Length > NameMaxLength)
            errors["name"] = [$"Name must be at most {NameMaxLength} characters."];

        if (email.Length == 0)
            errors["email"] = ["Email is required."];
        else if (email.Length > EmailMaxLength || !IsEmail(email))
            errors["email"] = ["Email is not a valid email address."];

        if (message.Length < MessageMinLength)
            errors["message"] = [$"Message must be at least {MessageMinLength} characters."];
        else if (message.Length > MessageMaxLength)
            errors["message"] = [$"Message must be at most {MessageMaxLength} characters."];

        return errors;
    }

    /// <summary>A single plain address with a dotted domain, e.g. name@example.com (no "Name &lt;...&gt;" forms).</summary>
    public static bool IsEmail(string value) =>
        MailAddress.TryCreate(value, out var address) &&
        address.Address == value &&
        address.Host.Contains('.') &&
        !address.Host.StartsWith('.') &&
        !address.Host.EndsWith('.');
}
