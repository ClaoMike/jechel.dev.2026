using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using static Portfolio.Api.Features.Files.FileShared;

namespace Portfolio.Api.Features.Files;

/// <summary>An academic paper: a PDF, kept as it is and downloaded under the name it was uploaded with.</summary>
public sealed class UploadPaper : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/files").MapPost("/paper", Handle).WithName("UploadPaper").RequireAuthorization();

    public static Task<Results<Ok<UploadedFile>, ValidationProblem>> Handle(HttpRequest request, IFileStorage storage, CancellationToken cancellationToken) =>
        UploadPdf(request, FileRules.PaperMaxBytes, "Paper", "The paper must be a PDF.", storage, cancellationToken);
}
