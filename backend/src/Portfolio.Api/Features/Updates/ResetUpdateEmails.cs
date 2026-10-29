using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Updates;

/// <summary>Back to the default wording.</summary>
public sealed class ResetUpdateEmails : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/updates/emails").RequireAuthorization().MapDelete("/", Handle).WithName("ResetUpdateEmails");

    public static async Task<Ok<UpdateEmailsDocument>> Handle(PortfolioDbContext db, CancellationToken cancellationToken)
    {
        if (await db.UpdateEmailsPages.FindAsync([UpdateEmailsPage.SingletonId], cancellationToken) is { } page)
        {
            db.UpdateEmailsPages.Remove(page);
            await db.SaveChangesAsync(cancellationToken);
        }
        return TypedResults.Ok(new UpdateEmailsDocument(UpdateEmailDefaults.Wording, UpdateEmailDefaults.Wording, null));
    }
}
