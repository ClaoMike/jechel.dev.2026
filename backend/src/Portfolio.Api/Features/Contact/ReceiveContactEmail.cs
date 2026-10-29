using Portfolio.Api.Common;

namespace Portfolio.Api.Features.Contact;

public sealed class ReceiveContactEmail : IEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapGroup("/contact").MapPost("/inbound", InboundEmail.Receive).WithName("ReceiveContactEmail");
}
