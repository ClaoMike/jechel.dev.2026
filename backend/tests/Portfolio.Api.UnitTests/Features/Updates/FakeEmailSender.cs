using Portfolio.Api.Features.Updates;

namespace Portfolio.Api.UnitTests.Features.Updates;

/// <summary>Keeps emails instead of sending them; <see cref="Fail"/> makes sending throw.</summary>
public sealed class FakeEmailSender : IEmailSender
{
    public List<EmailMessage> Sent { get; } = [];
    public bool Fail { get; set; }

    public Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        if (Fail) throw new HttpRequestException("Resend is down.");
        Sent.Add(message);
        return Task.CompletedTask;
    }
}
