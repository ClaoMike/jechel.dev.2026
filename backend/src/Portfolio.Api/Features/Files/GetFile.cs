using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;

namespace Portfolio.Api.Features.Files;

public sealed class GetFile : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/files").MapGet("/{id:guid}/{fileName}", Handle).WithName("GetFile");

    public static async Task<Results<FileContentHttpResult, NotFound>> Handle(Guid id, IFileStorage storage, HttpContext context, CancellationToken cancellationToken)
    {
        var file = await storage.GetAsync(id, cancellationToken);
        if (file is null) return TypedResults.NotFound();

        // Shown in the browser (inline); the page's download link saves it under FileName.
        context.Response.Headers.ContentDisposition = new System.Net.Mime.ContentDisposition { Inline = true, FileName = file.FileName }.ToString();
        context.Response.Headers.XContentTypeOptions = "nosniff";
        // Each upload gets a new id, so a file never changes: browsers keep it for a year instead of asking again every visit.
        context.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        // Ranges let a video start playing and skip around before it's all downloaded (Safari needs them).
        return TypedResults.File(file.Content, file.ContentType, enableRangeProcessing: true);
    }
}
