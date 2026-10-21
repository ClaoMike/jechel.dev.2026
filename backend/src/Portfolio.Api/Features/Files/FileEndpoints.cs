using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Portfolio.Api.Features.Files;

/// <param name="Url">Where the file is served from; put it in the page content (photoUrl, links.resumeUrl).</param>
public record UploadedFile(string Url, string FileName);

/// <param name="Kind">"image" or "video" (see <see cref="Apps.AppMediaKinds"/>).</param>
public record UploadedMedia(string Url, string FileName, string Kind);

public static class FileEndpoints
{
    public static IEndpointRouteBuilder MapFileEndpoints(this IEndpointRouteBuilder app)
    {
        var files = app.MapGroup("/files");

        // Admin only. Each reads its own form (multipart field "file"), so it can allow its own size;
        // like the rest of the API there are no antiforgery tokens: the session cookie is
        // SameSite=Lax, so another site can't post with it.
        files.MapPost("/photo", UploadPhoto).WithName("UploadPhoto").RequireAuthorization();
        files.MapPost("/paper", UploadPaper).WithName("UploadPaper").RequireAuthorization();
        files.MapPost("/app-media", UploadAppMedia).WithName("UploadAppMedia").RequireAuthorization();

        // Public. The name in the URL is only for the browser; the id finds the file.
        files.MapGet("/{id:guid}/{fileName}", GetFile).WithName("GetFile");

        return app;
    }

    /// <summary>Any common image format; stored as a WebP of at most 800×800 without metadata.</summary>
    public static async Task<Results<Ok<UploadedFile>, ValidationProblem>> UploadPhoto(HttpRequest request, IFileStorage storage, CancellationToken cancellationToken)
    {
        var (file, error) = await ReadUploadAsync(request, FileRules.PhotoMaxBytes, cancellationToken);
        if (error is not null) return error;

        byte[] photo;
        try
        {
            await using var stream = file!.OpenReadStream();
            photo = await FileRules.PreparePhotoAsync(stream, cancellationToken);
        }
        catch (NotAnImageException)
        {
            return Invalid("That file isn't an image we can read. Try a JPEG, PNG or WebP.");
        }

        const string name = "photo.webp";
        var id = await storage.SaveAsync(name, FileRules.PhotoContentType, photo, cancellationToken);
        return TypedResults.Ok(new UploadedFile(FileRules.UrlFor(id, name), name));
    }

    /// <summary>
    /// An image or a video for an app. Images are stored as a WebP of at most 1920×1920 without
    /// metadata, like the photo; MP4, MOV and WebM videos are kept as they are.
    /// </summary>
    public static async Task<Results<Ok<UploadedMedia>, ValidationProblem>> UploadAppMedia(HttpRequest request, IFileStorage storage, CancellationToken cancellationToken)
    {
        var (file, error) = await ReadUploadAsync(request, FileRules.AppVideoMaxBytes, cancellationToken);
        if (error is not null) return error;

        var header = new byte[12];
        await using (var stream = file!.OpenReadStream())
        {
            await stream.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false, cancellationToken);
        }

        if (FileRules.VideoContentType(header) is { } videoType)
        {
            var bytes = new byte[file.Length];
            await using (var stream = file.OpenReadStream())
            {
                await stream.ReadExactlyAsync(bytes, cancellationToken);
            }
            var videoName = FileRules.CleanFileName(file.FileName, "Video", FileRules.VideoExtension(videoType));
            var videoId = await storage.SaveAsync(videoName, videoType, bytes, cancellationToken);
            return TypedResults.Ok(new UploadedMedia(FileRules.UrlFor(videoId, videoName), videoName, Apps.AppMediaKinds.Video));
        }

        if (file.Length > FileRules.AppImageMaxBytes) return Invalid($"Images must be at most {FileRules.AppImageMaxBytes / 1024 / 1024} MB.");
        byte[] image;
        try
        {
            await using var stream = file.OpenReadStream();
            image = await FileRules.PreparePhotoAsync(stream, cancellationToken, FileRules.AppImageMaxPixels);
        }
        catch (NotAnImageException)
        {
            return Invalid("That file isn't an image or video we can use. Try a JPEG, PNG, WebP, GIF, MP4, MOV or WebM.");
        }

        const string name = "image.webp";
        var id = await storage.SaveAsync(name, FileRules.PhotoContentType, image, cancellationToken);
        return TypedResults.Ok(new UploadedMedia(FileRules.UrlFor(id, name), name, Apps.AppMediaKinds.Image));
    }

    /// <summary>An academic paper: a PDF, kept as it is and downloaded under the name it was uploaded with.</summary>
    public static Task<Results<Ok<UploadedFile>, ValidationProblem>> UploadPaper(HttpRequest request, IFileStorage storage, CancellationToken cancellationToken) =>
        UploadPdf(request, FileRules.PaperMaxBytes, "Paper", "The paper must be a PDF.", storage, cancellationToken);

    private static async Task<Results<Ok<UploadedFile>, ValidationProblem>> UploadPdf(HttpRequest request, long maxBytes, string fallbackName, string notPdf, IFileStorage storage, CancellationToken cancellationToken)
    {
        var (file, error) = await ReadUploadAsync(request, maxBytes, cancellationToken);
        if (error is not null) return error;

        // One copy in memory: the form has already buffered the upload to disk.
        var bytes = new byte[file!.Length];
        await using (var stream = file.OpenReadStream())
        {
            await stream.ReadExactlyAsync(bytes, cancellationToken);
        }
        if (!FileRules.LooksLikePdf(bytes)) return Invalid(notPdf);

        var name = FileRules.CleanFileName(file.FileName, fallbackName, ".pdf");
        var id = await storage.SaveAsync(name, FileRules.PdfContentType, bytes, cancellationToken);
        return TypedResults.Ok(new UploadedFile(FileRules.UrlFor(id, name), name));
    }

    public static async Task<Results<FileContentHttpResult, NotFound>> GetFile(Guid id, IFileStorage storage, HttpContext context, CancellationToken cancellationToken)
    {
        var file = await storage.GetAsync(id, cancellationToken);
        if (file is null) return TypedResults.NotFound();

        // Shown in the browser (inline); the page's download link saves it under FileName.
        context.Response.Headers.ContentDisposition = new System.Net.Mime.ContentDisposition { Inline = true, FileName = file.FileName }.ToString();
        context.Response.Headers.XContentTypeOptions = "nosniff";
        // Ranges let a video start playing and skip around before it's all downloaded (Safari needs them).
        return TypedResults.File(file.Content, file.ContentType, enableRangeProcessing: true);
    }

    /// <summary>
    /// Reads the "file" field of a multipart form of at most <paramref name="maxBytes"/>. Raises the
    /// server's request size limit (Kestrel's default is 30 MB) for this request only, before
    /// anything is read; bigger requests are cut off early.
    /// </summary>
    private static async Task<(IFormFile? File, ValidationProblem? Error)> ReadUploadAsync(HttpRequest request, long maxBytes, CancellationToken cancellationToken)
    {
        const long formOverhead = 1024 * 1024;
        var tooBig = Invalid($"The file must be at most {maxBytes / 1024 / 1024} MB.");
        if (request.HttpContext.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } sizeLimit)
        {
            sizeLimit.MaxRequestBodySize = maxBytes + formOverhead;
        }
        if (request.ContentLength > maxBytes + formOverhead) return (null, tooBig);
        if (!request.HasFormContentType) return (null, Invalid("Choose a file to upload."));

        request.HttpContext.Features.Set<IFormFeature>(new FormFeature(request, new FormOptions { MultipartBodyLengthLimit = maxBytes + formOverhead }));
        IFormCollection form;
        try
        {
            form = await request.ReadFormAsync(cancellationToken);
        }
        catch (Exception e) when (e is InvalidDataException or BadHttpRequestException)
        {
            return (null, tooBig);
        }

        var file = form.Files.GetFile("file");
        if (file is null || file.Length == 0) return (null, Invalid("Choose a file to upload."));
        if (file.Length > maxBytes) return (null, tooBig);
        return (file, null);
    }

    private static ValidationProblem Invalid(string message) => TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["file"] = [message] });
}
