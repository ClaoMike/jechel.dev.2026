using Microsoft.AspNetCore.Diagnostics;

namespace Portfolio.Api.Features.Alerts;

/// <summary>
/// An exception nothing caught (an API crash, answered with 500): alerts the phone, once an hour
/// per kind of exception and endpoint, then lets the default handler answer with a problem.
/// </summary>
public class CrashAlertHandler(IPhoneAlerts alerts, ILogger<CrashAlertHandler> logger) : IExceptionHandler
{
    public ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is OperationCanceledException && httpContext.RequestAborted.IsCancellationRequested) return ValueTask.FromResult(false);
        // A malformed request (e.g. ?page=two) is the caller's mistake, answered 400: not a crash.
        if (exception is BadHttpRequestException) return ValueTask.FromResult(false);

        var endpoint = $"{httpContext.Request.Method} {httpContext.Request.Path}";
        logger.LogError(exception, "Unhandled exception on {Endpoint}.", endpoint);
        alerts.SendThrottled(
            $"api:{exception.GetType().FullName}:{endpoint}",
            new PhoneAlert($"API crash: {exception.GetType().Name}", $"{endpoint}\n{exception.Message}", "/engagement", AlertPriority.High, "rotating_light"));
        return ValueTask.FromResult(false);
    }
}
