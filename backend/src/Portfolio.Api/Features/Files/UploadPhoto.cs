using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using static Portfolio.Api.Features.Files.FileShared;

namespace Portfolio.Api.Features.Files;

/// <summary>Any common image format; stored as a WebP of at most 800×800 without metadata.</summary>
public sealed class UploadPhoto : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/files").MapPost("/photo", Handle).WithName("UploadPhoto").RequireAuthorization();

    public static async Task<Results<Ok<UploadedFile>, ValidationProblem>> Handle(HttpRequest request, IFileStorage storage, CancellationToken cancellationToken)
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
}
