using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Portfolio.Api.Features.Files;

/// <param name="Url">Where the file is served from; put it in the page content (photoUrl, links.resumeUrl).</param>
public record UploadedFile(string Url, string FileName);

/// <param name="Kind">"image" or "video" (see <see cref="Apps.AppMediaKinds"/>).</param>
public record UploadedMedia(string Url, string FileName, string Kind);

public static class FileShared
{
    internal static async Task<Results<Ok<UploadedFile>, ValidationProblem>> UploadPdf(HttpRequest request, long maxBytes, string fallbackName, string notPdf, IFileStorage storage, CancellationToken cancellationToken)
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

    /// <summary>
    /// Reads the "file" field of a multipart form of at most <paramref name="maxBytes"/>. Raises the
    /// server's request size limit (Kestrel's default is 30 MB) for this request only, before
    /// anything is read; bigger requests are cut off early.
    /// </summary>
    internal static async Task<(IFormFile? File, ValidationProblem? Error)> ReadUploadAsync(HttpRequest request, long maxBytes, CancellationToken cancellationToken)
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

    internal static ValidationProblem Invalid(string message) => TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["file"] = [message] });
}
