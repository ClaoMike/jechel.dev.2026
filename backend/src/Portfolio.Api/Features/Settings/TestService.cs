using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;
using Portfolio.Api.Common;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Updates;
using Portfolio.Api.Features.YouTube;
using static Portfolio.Api.Features.Settings.SettingsShared;

namespace Portfolio.Api.Features.Settings;

/// <summary>Tries a service with the current settings: "ntfy" sends a test alert, "email" a test email to the admin, "youtube" lists the videos, "cal" checks the Cal.com API key.</summary>
public sealed class TestService : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/settings").RequireAuthorization().MapPost("/test/{service}", Handle).WithName("TestService");

    public static async Task<Results<Ok<TestResult>, NotFound>> Handle(
        string service,
        NtfySender ntfy,
        IEmailSender emails,
        IYouTubeClient youTube,
        IOptionsMonitor<YouTubeOptions> youTubeOptions,
        Meetings.ICalClient cal,
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        try
        {
            switch (service)
            {
                case "ntfy":
                    if (!await ntfy.SendAsync(new PhoneAlert(AlertKinds.Test, "It works!", "Alerts from jechel.dev will arrive here.", "/settings", AlertPriority.Default, "tada"), cancellationToken))
                        return TypedResults.Ok(new TestResult(false, "Set the topic first."));
                    return TypedResults.Ok(new TestResult(true, "Sent. It should be on your phone now."));

                case "email":
                    var to = user.FindFirstValue(ClaimTypes.Email) ?? "";
                    if (emails is SwitchingEmailSender { IsConfigured: false })
                        return TypedResults.Ok(new TestResult(false, "Set the Resend API key first."));
                    await emails.SendAsync(new EmailMessage(to, "jechel.dev: test email", "<p>Emails from jechel.dev work.</p>", "Emails from jechel.dev work."), cancellationToken);
                    return TypedResults.Ok(new TestResult(true, $"Sent to {to}."));

                case "youtube":
                    if (!youTubeOptions.CurrentValue.IsConfigured)
                        return TypedResults.Ok(new TestResult(false, "Set the channel and the API key first."));
                    var videos = await youTube.FetchVideosAsync(cancellationToken);
                    return TypedResults.Ok(new TestResult(true, $"Found {videos.Count} public {(videos.Count == 1 ? "video" : "videos")}."));

                case "cal":
                    return TypedResults.Ok(new TestResult(true, $"The API key works, for {await cal.WhoAmIAsync(cancellationToken)}."));

                default:
                    return TypedResults.NotFound();
            }
        }
        catch (Exception e) when (!cancellationToken.IsCancellationRequested)
        {
            return TypedResults.Ok(new TestResult(false, Explain(e)));
        }
    }
}
