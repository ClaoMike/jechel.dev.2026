using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Common;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Meetings;

/// <summary>Admin only. Meetings that overlap [from, to) (a calendar month), soonest first; by default the next 60 days.</summary>
public sealed class ListMeetings : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/meetings").MapGet("/", Handle).WithName("ListMeetings").RequireAuthorization();

    public static async Task<Ok<IReadOnlyList<MeetingDto>>> Handle(PortfolioDbContext db, TimeProvider time, CancellationToken cancellationToken, DateTimeOffset? from = null, DateTimeOffset? to = null)
    {
        var start = from ?? time.GetUtcNow().AddDays(-1);
        var end = to ?? start.AddDays(61);
        var meetings = await db.Meetings.AsNoTracking()
            .Where(m => m.StartTime < end && m.EndTime >= start)
            .OrderBy(m => m.StartTime)
            .Select(m => new MeetingDto(m.Id, m.Title, m.StartTime, m.EndTime, m.AttendeeName, m.AttendeeEmail, m.AttendeeTimeZone, m.Notes, m.Status,
                db.ContactMessages.Any(c => c.Email.ToLower() == m.AttendeeEmail.ToLower())))
            .ToListAsync(cancellationToken);
        return TypedResults.Ok<IReadOnlyList<MeetingDto>>(meetings);
    }
}
