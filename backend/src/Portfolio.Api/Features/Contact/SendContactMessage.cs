using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Common;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using static Portfolio.Api.Features.Contact.ContactShared;

namespace Portfolio.Api.Features.Contact;

public sealed class SendContactMessage : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/contact").MapPost("/", Handle).WithName("SendContactMessage").RequireRateLimiting(RateLimitPolicy);

    public static async Task<Results<Created, ValidationProblem>> Handle(
        SendMessageRequest request,
        PortfolioDbContext db,
        TimeProvider time,
        IPhoneAlerts alerts,
        CancellationToken cancellationToken)
    {
        var errors = ContactRules.Validate(request);
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var message = new ContactMessage
        {
            Name = request.Name!.Trim(),
            Email = request.Email!.Trim(),
            Message = request.Message!.Trim(),
            ReceivedAt = time.GetUtcNow(),
            Subject = request.Topic == ContactRules.ProjectTopic ? ContactRules.ProjectSubject : null,
        };
        message.LastActivityAt = message.ReceivedAt;
        db.ContactMessages.Add(message);
        await db.SaveChangesAsync(cancellationToken);

        var title = message.Subject == ContactRules.ProjectSubject ? $"New project enquiry from {message.Name}" : $"New message from {message.Name}";
        alerts.Send(new PhoneAlert(AlertKinds.Message, title, message.Message, "/contact", AlertPriority.High, "envelope"));

        return TypedResults.Created();
    }
}
