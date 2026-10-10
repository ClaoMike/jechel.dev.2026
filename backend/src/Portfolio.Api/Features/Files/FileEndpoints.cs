using Microsoft.AspNetCore.Http.HttpResults;
using SixLabors.ImageSharp;

namespace Portfolio.Api.Features.Files;

/// <param name="Url">Where the file is served from; put it in the page content (photoUrl, links.resumeUrl).</param>
public record UploadedFile(string Url, string FileName);

public static class FileEndpoints
{
    public static IEndpointRouteBuilder MapFileEndpoints(this IEndpointRouteBuilder app)
    {
        var files = app.MapGroup("/files");

        // Admin only. Antiforgery tokens are off for these form posts like for the rest of the
        // API: the session cookie is SameSite=Lax, so another site can't post with it.
        files.MapPost("/photo", UploadPhoto).WithName("UploadPhoto").RequireAuthorization().DisableAntiforgery();
        files.MapPost("/resume", UploadResume).WithName("UploadResume").RequireAuthorization().DisableAntiforgery();

        // Public. The name in the URL is only for the browser; the id finds the file.
        files.MapGet("/{id:guid}/{fileName}", GetFile).WithName("GetFile");

        return app;
    }

    /// <summary>Any common image format; stored as a WebP of at most 800×800 without metadata.</summary>
    public static async Task<Results<Ok<UploadedFile>, ValidationProblem>> UploadPhoto(IFormFile? file, IFileStorage storage, CancellationToken cancellationToken)
    {
        if (CheckSize(file, FileRules.PhotoMaxBytes) is { } error) return error;

        byte[] photo;
        try
        {
            await using var stream = file!.OpenReadStream();
            photo = await FileRules.PreparePhotoAsync(stream, cancellationToken);
        }
        catch (Exception e) when (e is ImageFormatException or NotSupportedException)
        {
            return Invalid("That file isn't an image we can read. Try a JPEG, PNG or WebP.");
        }

        const string name = "photo.webp";
        var id = await storage.SaveAsync(name, FileRules.PhotoContentType, photo, cancellationToken);
        return TypedResults.Ok(new UploadedFile(FileRules.UrlFor(id, name), name));
    }

    /// <summary>A PDF, kept as it is and downloaded under the name it was uploaded with.</summary>
    public static async Task<Results<Ok<UploadedFile>, ValidationProblem>> UploadResume(IFormFile? file, IFileStorage storage, CancellationToken cancellationToken)
    {
        if (CheckSize(file, FileRules.ResumeMaxBytes) is { } error) return error;

        using var buffer = new MemoryStream();
        await file!.CopyToAsync(buffer, cancellationToken);
        var bytes = buffer.ToArray();
        if (!FileRules.LooksLikePdf(bytes)) return Invalid("The résumé must be a PDF.");

        var name = FileRules.CleanFileName(file.FileName, "Resume", ".pdf");
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
        return TypedResults.File(file.Content, file.ContentType);
    }

    private static ValidationProblem? CheckSize(IFormFile? file, long maxBytes)
    {
        if (file is null || file.Length == 0) return Invalid("Choose a file to upload.");
        if (file.Length > maxBytes) return Invalid($"The file must be at most {maxBytes / 1024 / 1024} MB.");
        return null;
    }

    private static ValidationProblem Invalid(string message) => TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["file"] = [message] });
}
