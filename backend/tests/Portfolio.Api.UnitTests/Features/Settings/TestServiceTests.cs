using System.Net;
using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Portfolio.Api.Features.Meetings;
using Portfolio.Api.Features.Settings;
using Portfolio.Api.Features.YouTube;
using Portfolio.Api.UnitTests.Features.Updates;

namespace Portfolio.Api.UnitTests.Features.Settings;

/// <summary>A test button that fails says why, in a line the admin can act on, whatever went wrong.</summary>
public class TestServiceTests
{
    private sealed class FailingCal(Exception failure) : ICalClient
    {
        public Task ConfirmAsync(string uid, CancellationToken cancellationToken) => throw failure;
        public Task DeclineAsync(string uid, string? reason, CancellationToken cancellationToken) => throw failure;
        public Task CancelAsync(string uid, string reason, CancellationToken cancellationToken) => throw failure;
        public Task<string> WhoAmIAsync(CancellationToken cancellationToken) => throw failure;
    }

    private static async Task<TestResult> Check(Exception failure)
    {
        var result = await TestService.Handle("cal", null!, new FakeEmailSender(), null!, TestOptions.Monitor(new YouTubeOptions()), new FailingCal(failure), new ClaimsPrincipal(), default);
        return Assert.IsType<Ok<TestResult>>(result.Result).Value!;
    }

    public static TheoryData<Exception, string> Failures => new()
    {
        { new ServiceException("Cal.com refused it: invalid API key"), "Cal.com refused it: invalid API key" },
        { new HttpRequestException("Forbidden", null, HttpStatusCode.Forbidden), "The service answered 403 Forbidden." },
        { new HttpRequestException("No route to host"), "The service couldn't be reached." },
        { new TaskCanceledException(), "The service took too long to answer." },
        { new InvalidOperationException("Something odd"), "Something odd" },
    };

    [Theory]
    [MemberData(nameof(Failures))]
    public async Task Says_what_went_wrong(Exception failure, string expected)
    {
        var result = await Check(failure);

        Assert.Equal((false, expected), (result.Ok, result.Message));
    }

    [Fact]
    public async Task An_unknown_service_is_not_found()
    {
        var result = await TestService.Handle("fax", null!, new FakeEmailSender(), null!, TestOptions.Monitor(new YouTubeOptions()), new Portfolio.Api.UnitTests.Features.Meetings.FakeCalClient(), new ClaimsPrincipal(), default);

        Assert.IsType<NotFound>(result.Result);
    }
}
