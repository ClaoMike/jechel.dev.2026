namespace Portfolio.Api.Features.Alerts;

/// <summary>One kind of phone alert, as the Notifications tab lists it.</summary>
/// <param name="Key">What alerts carry (<see cref="PhoneAlert.Kind"/>) and the preference is stored under.</param>
/// <param name="Group">The heading it's listed under.</param>
public record AlertKind(string Key, string Label, string Group);

/// <summary>
/// Every kind of alert the site sends to the admin's phone. Each can be switched off in the Notifications tab:
/// it's still listed in the history there, marked not sent. Add a kind here when adding a new alert.
/// </summary>
public static class AlertKinds
{
    public const string Message = "message";
    public const string MeetingRequest = "meeting-request";
    public const string MeetingChange = "meeting-change";
    public const string MeetingReminder = "meeting-reminder";
    public const string Coffee = "coffee";
    public const string Subscriber = "subscriber";
    public const string NewApp = "new-app";
    public const string UpdateSent = "update-sent";
    public const string EmailFailing = "email-failing";
    public const string SiteError = "site-error";
    public const string ApiCrash = "api-crash";
    public const string SignIn = "sign-in";
    public const string SignInRefused = "sign-in-refused";

    /// <summary>Settings → ntfy → Send a test alert: sent straight away, whatever is switched off, and not listed.</summary>
    public const string Test = "test";

    public static readonly IReadOnlyList<AlertKind> All =
    [
        new(Message, "New message", "Visitors"),
        new(MeetingRequest, "Meeting request", "Visitors"),
        new(MeetingChange, "Meeting booked, moved or cancelled", "Visitors"),
        new(MeetingReminder, "Meeting reminder", "Visitors"),
        new(Coffee, "Buy Me a Coffee", "Community"),
        new(Subscriber, "New subscriber", "Community"),
        new(NewApp, "New app to email", "Community"),
        new(UpdateSent, "Update email sent", "Community"),
        new(EmailFailing, "Emails not going out", "Problems"),
        new(SiteError, "Site error", "Problems"),
        new(ApiCrash, "API crash", "Problems"),
        new(SignIn, "Signed in", "Security"),
        new(SignInRefused, "Sign-in refused", "Security"),
    ];

    public static AlertKind? Find(string key) => All.FirstOrDefault(k => k.Key == key);
}
