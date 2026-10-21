using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Settings;
using Portfolio.Api.Features.YouTube;

namespace Portfolio.Api.Features.Updates;

public static class UpdateEmailKinds
{
    public const string Confirm = "confirm";
    public const string Video = "video";
    public const string App = "app";
    public static readonly IReadOnlyList<string> All = [Confirm, Video, App];
}

/// <param name="Kind">One of <see cref="UpdateEmailKinds"/>.</param>
/// <param name="Wording">The wording to show it in: the one being edited, saved or not.</param>
public record UpdateEmailPreviewRequest(string? Kind, UpdateEmailWording? Wording);

/// <param name="From">The sender it goes out from.</param>
public record UpdateEmailPreview(string From, string Subject, string Html, string Text);

/// <summary>The admin's editor for the emails subscribers get (Community tab): their wording, a preview, and a test sent to the admin.</summary>
public static class UpdateEmailsEndpoints
{
    private static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;

    public static IEndpointRouteBuilder MapUpdateEmailsEndpoints(this IEndpointRouteBuilder app)
    {
        var emails = app.MapGroup("/updates/emails").RequireAuthorization();

        emails.MapGet("/", GetWording).WithName("GetUpdateEmails");
        emails.MapPut("/", SaveWording).WithName("SaveUpdateEmails");
        emails.MapDelete("/", ResetWording).WithName("ResetUpdateEmails");
        emails.MapPost("/preview", Preview).WithName("PreviewUpdateEmail");
        emails.MapPost("/test", SendTest).WithName("TestUpdateEmail");

        return app;
    }

    /// <summary>The wording the emails go out in: the admin's, or the defaults until they save their own.</summary>
    public static async Task<UpdateEmailWording> LoadAsync(PortfolioDbContext db, CancellationToken cancellationToken) =>
        (await LoadDocumentAsync(db, cancellationToken)).Wording;

    public static async Task<Ok<UpdateEmailsDocument>> GetWording(PortfolioDbContext db, CancellationToken cancellationToken) =>
        TypedResults.Ok(await LoadDocumentAsync(db, cancellationToken));

    /// <summary>Replaces the wording; returns it as stored (trimmed).</summary>
    public static async Task<Results<Ok<UpdateEmailsDocument>, ValidationProblem>> SaveWording(
        UpdateEmailWording wording,
        PortfolioDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var errors = UpdateEmailRules.Validate(wording);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var normalized = UpdateEmailRules.Normalize(wording);
        var page = await db.UpdateEmailsPages.FindAsync([UpdateEmailsPage.SingletonId], cancellationToken);
        if (page is null)
        {
            page = new UpdateEmailsPage { Id = UpdateEmailsPage.SingletonId, Content = "" };
            db.UpdateEmailsPages.Add(page);
        }
        page.Content = JsonSerializer.Serialize(normalized, Json);
        page.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.Ok(new UpdateEmailsDocument(normalized, UpdateEmailDefaults.Wording, page.UpdatedAt));
    }

    /// <summary>Back to the default wording.</summary>
    public static async Task<Ok<UpdateEmailsDocument>> ResetWording(PortfolioDbContext db, CancellationToken cancellationToken)
    {
        if (await db.UpdateEmailsPages.FindAsync([UpdateEmailsPage.SingletonId], cancellationToken) is { } page)
        {
            db.UpdateEmailsPages.Remove(page);
            await db.SaveChangesAsync(cancellationToken);
        }
        return TypedResults.Ok(new UpdateEmailsDocument(UpdateEmailDefaults.Wording, UpdateEmailDefaults.Wording, null));
    }

    /// <summary>The email as a subscriber would get it, in the given wording, about the newest app or video (or a made-up one).</summary>
    public static async Task<Results<Ok<UpdateEmailPreview>, ValidationProblem>> Preview(
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

    /// <summary>
    /// Sends the preview to the signed-in admin, marked as a test. When the admin's address is subscribed, its links carry
    /// the admin's own code, so Unsubscribe in it really unsubscribes; otherwise a code that belongs to nobody.
    /// </summary>
    public static async Task<Results<Ok<TestResult>, ValidationProblem>> SendTest(
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

    private static async Task<UpdateEmailsDocument> LoadDocumentAsync(PortfolioDbContext db, CancellationToken cancellationToken)
    {
        var page = await db.UpdateEmailsPages.AsNoTracking()
            .Where(p => p.Id == UpdateEmailsPage.SingletonId)
            .Select(p => new { p.Content, p.UpdatedAt })
            .FirstOrDefaultAsync(cancellationToken);
        return page is null
            ? new UpdateEmailsDocument(UpdateEmailDefaults.Wording, UpdateEmailDefaults.Wording, null)
            : new UpdateEmailsDocument(Read(page.Content), UpdateEmailDefaults.Wording, page.UpdatedAt);
    }

    /// <summary>
    /// The stored wording. Saved before a new video or app had a message and a note, it had a one-line heading instead:
    /// that becomes the message, and the note stays empty.
    /// </summary>
    public static UpdateEmailWording Read(string content)
    {
        var json = JsonNode.Parse(content)!.AsObject();
        foreach (var kind in new[] { UpdateEmailKinds.Video, UpdateEmailKinds.App })
        {
            if (json[kind] is not JsonObject item) continue;
            if (item["intro"] is null && item["heading"] is { } heading) item["intro"] = heading.GetValue<string>();
            item["note"] ??= "";
            item.Remove("heading");
        }
        return json.Deserialize<UpdateEmailWording>(Json)!;
    }

    private static Dictionary<string, string[]> Check(UpdateEmailPreviewRequest request)
    {
        var errors = UpdateEmailRules.Validate(request.Wording);
        if (!UpdateEmailKinds.All.Contains(request.Kind ?? "")) errors["kind"] = [$"Must be one of: {string.Join(", ", UpdateEmailKinds.All)}."];
        return errors;
    }

    /// <summary>For an address that isn't subscribed: the links lead to the real pages, which find no one for it.</summary>
    private const string SampleToken = "preview";

    private static async Task<EmailMessage> SampleAsync(
        string kind,
        UpdateEmailWording wording,
        string to,
        PortfolioDbContext db,
        SiteOptions site,
        IOptionsMonitor<YouTubeOptions> youTubeOptions,
        YouTubeVideoStore videos,
        CancellationToken cancellationToken)
    {
        var address = to.Trim().ToLowerInvariant();
        var token = await db.Subscribers.AsNoTracking().Where(s => s.Email == address).Select(s => s.Token).FirstOrDefaultAsync(cancellationToken) ?? SampleToken;
        if (kind == UpdateEmailKinds.Confirm) return UpdateEmails.Confirmation(to, token, wording, site);

        UpdateItem? item = null;
        if (kind == UpdateEmailKinds.Video)
        {
            var newest = youTubeOptions.CurrentValue.IsConfigured ? (await videos.GetAsync(cancellationToken))?.MaxBy(v => v.PublishedAt) : null;
            item = newest is null ? null : UpdatesAnnouncer.VideoItem(newest);
            item ??= new UpdateItem("How I built a game in a weekend", "From an empty project to a playable game: the plan, the tools, and what I'd do differently.", "https://www.youtube.com/", null);
        }
        else
        {
            var newest = await db.Apps.AsNoTracking().OrderByDescending(a => a.CreatedAt).FirstOrDefaultAsync(cancellationToken);
            item = newest is null ? null : UpdatesAnnouncer.AppItem(newest, site);
            item ??= new UpdateItem("Space Game", "A small arcade game: dodge the asteroids, collect the stars.", site.UrlFor("/apps"), null);
        }
        return UpdateEmails.NewItem(to, kind, item, token, wording, site);
    }
}
