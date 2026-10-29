using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;
using Portfolio.Api.Common;

namespace Portfolio.Api.Features.Meetings;

/// <summary>Admin only. The booking link to send in an answer, or "" when no booking page is set.</summary>
public sealed class GetMeetingsInfo : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/meetings").MapGet("/info", Handle).WithName("GetMeetingsInfo").RequireAuthorization();

    public static Ok<MeetingsInfo> Handle(IOptionsMonitor<CalOptions> options) => TypedResults.Ok(new MeetingsInfo(options.CurrentValue.BookingUrl));
}
