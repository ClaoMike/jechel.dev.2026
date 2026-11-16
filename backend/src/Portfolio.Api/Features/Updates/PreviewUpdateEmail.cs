using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.YouTube;
using static Portfolio.Api.Features.Updates.UpdateEmailsShared;

namespace Portfolio.Api.Features.Updates;

/// <summary>The email as a subscriber would get it, in the given wording, about the newest app or video (or a made-up one).</summary>
public sealed class PreviewUpdateEmail : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/updates/emails").RequireAuthorization().MapPost("/preview", Handle).WithName("PreviewUpdateEmail");

    public static async Task<Results<Ok<UpdateEmailPreview>, ValidationProblem>> Handle(
        UpdateEmailPreviewRequest request,
        PortfolioDbContext db,
        IOptions<SiteOptions> site,
        IOptionsMonitor<EmailOptions> emailOptions,
        IOptionsMonitor<YouTubeOptions> youTubeOptions,
        YouTubeVideoStore videos,
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        var errors = Check(request);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var message = await SampleAsync(request.Kind!, UpdateEmailRules.Normalize(request.Wording!), user.FindFirstValue(ClaimTypes.Email) ?? "you@example.com", db, site.Value, youTubeOptions, videos, cancellationToken);
        return TypedResults.Ok(new UpdateEmailPreview(emailOptions.CurrentValue.SenderOf(message), message.Subject, UpdateEmails.ForBrowser(message), message.Text));
    }
}
