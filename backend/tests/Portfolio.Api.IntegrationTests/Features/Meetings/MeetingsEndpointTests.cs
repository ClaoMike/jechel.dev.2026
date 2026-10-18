using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using Portfolio.Api.Features.Contact;
using Portfolio.Api.Features.Meetings;

namespace Portfolio.Api.IntegrationTests.Features.Meetings;

[Collection(ApiCollection.Name)]
public class MeetingsEndpointTests(PortfolioApiFactory factory)
{
    private async Task<HttpClient> SignedInClientAsync()
    {
        var client = factory.CreateBrowserClient();
        var response = await client.GetAsync($"{PortfolioApiFactory.SignInPath}?email={PortfolioApiFactory.AdminEmail}");
        response.EnsureSuccessStatusCode();
        return client;
    }

    private static HttpRequestMessage Webhook(string trigger, string uid, string email)
    {
        var start = DateTimeOffset.UtcNow.AddDays(3).ToString("O");
        var end = DateTimeOffset.UtcNow.AddDays(3).AddMinutes(30).ToString("O");
        var body = "{\"triggerEvent\":\"" + trigger + "\",\"payload\":{\"uid\":\"" + uid + "\",\"title\":\"30 min\",\"startTime\":\"" + start + "\",\"endTime\":\"" + end
            + "\",\"attendees\":[{\"name\":\"Grace\",\"email\":\"" + email + "\",\"timeZone\":\"Europe/London\"}]}}";
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/meetings/cal") { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        request.Headers.Add("x-cal-signature-256", Convert.ToHexStringLower(HMACSHA256.HashData(Encoding.UTF8.GetBytes(PortfolioApiFactory.CalSecret), Encoding.UTF8.GetBytes(body))));
        return request;
    }

    [Fact]
    public async Task Anyone_gets_the_booking_page()
    {
        var info = await factory.CreateBrowserClient().GetFromJsonAsync<MeetingsInfo>("/api/meetings/info");

        Assert.Equal("claomike/30min", info!.CalLink);
    }

    [Fact]
    public async Task A_requested_meeting_shows_in_the_calendar_and_with_the_message_and_the_admin_accepts_it()
    {
        var uid = Guid.NewGuid().ToString();
        var email = $"grace-{Guid.NewGuid():N}@example.com";
        Assert.Equal(HttpStatusCode.OK, (await factory.CreateClient().SendAsync(Webhook("BOOKING_REQUESTED", uid, email))).StatusCode);
        var visitor = factory.CreateBrowserClient();
        await visitor.PostAsJsonAsync("/api/contact", new SendMessageRequest("Grace", email, new string('m', 120)));

        var admin = await SignedInClientAsync();
        var calendar = await admin.GetFromJsonAsync<List<MeetingDto>>("/api/meetings");
        var meeting = Assert.Single(calendar!, m => m.AttendeeEmail == email);
        Assert.Equal(MeetingStatus.Requested, meeting.Status);

        var messages = await admin.GetFromJsonAsync<PagedResponse<ContactMessageSummary>>("/api/contact/messages?pageSize=50");
        var details = await admin.GetFromJsonAsync<ContactMessageDetails>($"/api/contact/messages/{messages!.Items.First(m => m.Name == "Grace").Id}");
        Assert.Contains(details!.Meetings, m => m.Id == meeting.Id);

        var accept = await admin.PostAsJsonAsync($"/api/meetings/{meeting.Id}/accept", new MeetingDecisionRequest("See you then!"));
        Assert.Equal(HttpStatusCode.OK, accept.StatusCode);
        Assert.Contains($"confirm {uid}", factory.Cal.Calls);
        Assert.Contains("See you then!", Assert.Single(factory.Emails.To(email)).Text);
    }

    [Fact]
    public async Task Visitors_cant_see_the_calendar_or_decide_without_the_token()
    {
        var uid = Guid.NewGuid().ToString();
        await factory.CreateClient().SendAsync(Webhook("BOOKING_REQUESTED", uid, "x@example.com"));
        var admin = await SignedInClientAsync();
        var id = (await admin.GetFromJsonAsync<List<MeetingDto>>("/api/meetings"))!.Single(m => m.Title == "30 min" && m.AttendeeEmail == "x@example.com" && m.Status == "requested").Id;

        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateBrowserClient().GetAsync("/api/meetings")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().PostAsync($"/api/meetings/{id}/accept?token=guess", null)).StatusCode);
    }

    [Fact]
    public async Task A_wrongly_signed_webhook_is_refused()
    {
        var request = Webhook("BOOKING_REQUESTED", Guid.NewGuid().ToString(), "y@example.com");
        request.Headers.Remove("x-cal-signature-256");
        request.Headers.Add("x-cal-signature-256", "deadbeef");

        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().SendAsync(request)).StatusCode);
    }

    [Fact]
    public async Task The_admin_replies_to_a_message_by_email()
    {
        var email = $"reply-{Guid.NewGuid():N}@example.com";
        await factory.CreateBrowserClient().PostAsJsonAsync("/api/contact", new SendMessageRequest("Linus", email, new string('m', 120)));
        var admin = await SignedInClientAsync();
        var id = (await admin.GetFromJsonAsync<PagedResponse<ContactMessageSummary>>("/api/contact/messages?pageSize=50"))!.Items.First(m => m.Name == "Linus").Id;

        var reply = await admin.PostAsJsonAsync($"/api/contact/messages/{id}/reply", new ReplyRequest("Happy to help."));

        Assert.Equal(HttpStatusCode.OK, reply.StatusCode);
        var sent = Assert.Single(factory.Emails.To(email));
        Assert.Equal(PortfolioApiFactory.AdminEmail, sent.ReplyTo);
        var details = await admin.GetFromJsonAsync<ContactMessageDetails>($"/api/contact/messages/{id}");
        Assert.Equal("Happy to help.", Assert.Single(details!.Replies).Text);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateBrowserClient().PostAsJsonAsync($"/api/contact/messages/{id}/reply", new ReplyRequest("x"))).StatusCode);
    }
}
