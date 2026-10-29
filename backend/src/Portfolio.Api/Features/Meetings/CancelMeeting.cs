using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using static Portfolio.Api.Features.Meetings.MeetingsShared;

namespace Portfolio.Api.Features.Meetings;

/// <summary>
/// Admin only. Cancels an accepted meeting that hasn't ended with Cal.com, which emails the attendee (with the
/// message as the reason). Its webhook then finds it cancelled already, so the phone isn't told about it.
/// Cancelling again, or a meeting that isn't accepted, answers with its status.
/// </summary>
public sealed class CancelMeeting : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/meetings").MapPost("/{id:int}/cancel", Handle).WithName("CancelMeeting").RequireAuthorization();

    public static async Task<Results<Ok<MeetingDecisionResult>, NotFound, ValidationProblem, ProblemHttpResult>> Handle(
        int id,
        MeetingDecisionRequest? request,
        PortfolioDbContext db,
        ICalClient cal,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var meeting = await db.Meetings.FindAsync([id], cancellationToken);
        if (meeting is null) return TypedResults.NotFound();

        var reason = request?.Message?.Trim() ?? "";
        if (reason.Length > MessageMaxLength) return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["message"] = [$"At most {MessageMaxLength} characters."] });
        if (meeting.Status != MeetingStatus.Accepted) return TypedResults.Ok(new MeetingDecisionResult(meeting.Status, false));
        if (meeting.EndTime <= time.GetUtcNow()) return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["meeting"] = ["It's over already."] });

        // Marked first: Cal.com's webhook for it can come back before its answer does, and must find it cancelled
        // already (or the phone hears of it). Put back if Cal.com refuses.
        var updatedAt = meeting.UpdatedAt;
        meeting.Status = MeetingStatus.Cancelled;
        meeting.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);
        var cancelled = false;
        try
        {
            await cal.CancelAsync(meeting.Uid, reason.Length > 0 ? reason : DefaultCancelReason, cancellationToken);
            cancelled = true;
        }
        catch (Exception e) when (CalFailed(e, cancellationToken))
        {
            return TypedResults.Problem(CalFailure(e), statusCode: StatusCodes.Status502BadGateway);
        }
        finally
        {
            // Whatever went wrong. (Should Cal.com have cancelled it anyway, an answer lost on the way, it's cancelled there.)
            if (!cancelled)
            {
                meeting.Status = MeetingStatus.Accepted;
                meeting.UpdatedAt = updatedAt;
                await db.SaveChangesAsync(CancellationToken.None);
            }
        }
        return TypedResults.Ok(new MeetingDecisionResult(meeting.Status, true));
    }
}
