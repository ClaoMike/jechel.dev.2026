using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Settings;
using Portfolio.Api.Features.YouTube;
using static Portfolio.Api.Features.Updates.UpdateEmailsShared;

namespace Portfolio.Api.Features.Updates;

/// <summary>
/// Sends the preview to the signed-in admin, marked as a test. When the admin's address is subscribed, its links carry
/// the admin's own code, so Unsubscribe in it really unsubscribes; otherwise a code that belongs to nobody.
/// </summary>
public sealed class TestUpdateEmail : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/updates/emails").RequireAuthorization().MapPost("/test", Handle).WithName("TestUpdateEmail");

    public static async Task<Results<Ok<TestResult>, ValidationProblem>> Handle(
        UpdateEmailPreviewRequest request,
        PortfolioDbContext db,
        IEmailSender emails,
        IOptions<SiteOptions> site,
        IOptionsMonitor<YouTubeOptions> youTubeOptions,
        YouTubeVideoStore videos,
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        var errors = Check(request);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var to = user.FindFirstValue(ClaimTypes.Email) ?? "";
        if (to.Length == 0) return TypedResults.Ok(new TestResult(false, "Your sign-in has no email address to send it to."));
        if (emails is SwitchingEmailSender { IsConfigured: false }) return TypedResults.Ok(new TestResult(false, "Set the Resend API key first (Settings → Resend)."));

        var message = await SampleAsync(request.Kind!, UpdateEmailRules.Normalize(request.Wording!), to, db, site.Value, youTubeOptions, videos, cancellationToken);
        try
        {
            await emails.SendAsync(message with { Subject = $"[Test] {message.Subject}" }, cancellationToken);
        }
        catch (Exception e) when (!cancellationToken.IsCancellationRequested)
        {
            return TypedResults.Ok(new TestResult(false, e is ServiceException ? e.Message : "The email service couldn't be reached."));
        }
        return TypedResults.Ok(new TestResult(true, $"Sent to {to}."));
    }
}
