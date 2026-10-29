using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Apps;
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
public static class UpdateEmailsShared
{
    internal static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;

    /// <summary>The wording the emails go out in: the admin's, or the defaults until they save their own.</summary>
    public static async Task<UpdateEmailWording> LoadAsync(PortfolioDbContext db, CancellationToken cancellationToken) =>
        (await LoadDocumentAsync(db, cancellationToken)).Wording;

    internal static async Task<UpdateEmailsDocument> LoadDocumentAsync(PortfolioDbContext db, CancellationToken cancellationToken)
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

    internal static Dictionary<string, string[]> Check(UpdateEmailPreviewRequest request)
    {
        var errors = UpdateEmailRules.Validate(request.Wording);
        if (!UpdateEmailKinds.All.Contains(request.Kind ?? "")) errors["kind"] = [$"Must be one of: {string.Join(", ", UpdateEmailKinds.All)}."];
        return errors;
    }

    /// <summary>
    /// The code in a test email's links when the admin's address isn't subscribed. The confirm and unsubscribe pages
    /// know it (frontend: TEST_TOKEN) and say the link came from a test, which changes nothing.
    /// </summary>
    public const string TestToken = "test";

    internal static async Task<EmailMessage> SampleAsync(
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
        var token = await db.Subscribers.AsNoTracking().Where(s => s.Email == address).Select(s => s.Token).FirstOrDefaultAsync(cancellationToken) ?? TestToken;
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
            // The first app in the admin's order (Organise), as a sample.
            var first = await db.Apps.AsNoTracking().InOrder().FirstOrDefaultAsync(cancellationToken);
            item = first is null ? null : UpdatesAnnouncer.AppItem(first, site);
            item ??= new UpdateItem("Space Game", "A small arcade game: dodge the asteroids, collect the stars.", site.UrlFor("/apps"), null);
        }
        return UpdateEmails.NewItem(to, kind, item, token, wording, site);
    }
}
