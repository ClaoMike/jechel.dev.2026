using Microsoft.Extensions.Options;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Auth;
using Portfolio.Api.Features.Updates;
using static Portfolio.Api.Features.Meetings.MeetingsShared;

namespace Portfolio.Api.Features.Meetings;

public sealed class AcceptMeeting : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/meetings").MapPost("/{id:int}/accept", (int id, string? token, MeetingDecisionRequest? request, HttpContext http, PortfolioDbContext db, ICalClient cal, IEmailSender emails, IOptionsMonitor<AdminOptions> admins, IOptionsMonitor<EmailOptions> emailOptions, TimeProvider time, ILoggerFactory loggers, CancellationToken ct) =>
            Decide(id, token, true, request, http, db, cal, emails, admins, emailOptions, time, loggers, ct)).WithName("AcceptMeeting");
}
