using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using static Portfolio.Api.Features.Files.FileShared;

namespace Portfolio.Api.Features.Files;

/// <summary>
/// An image or a video for an app. Images are stored as a WebP of at most 1920×1920 without
/// metadata, like the photo; MP4, MOV and WebM videos are kept as they are.
/// </summary>
public sealed class UploadAppMedia : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/files").MapPost("/app-media", Handle).WithName("UploadAppMedia").RequireAuthorization();

    public static async Task<Results<Ok<UploadedMedia>, ValidationProblem>> Handle(HttpRequest request, IFileStorage storage, CancellationToken cancellationToken)
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
}
