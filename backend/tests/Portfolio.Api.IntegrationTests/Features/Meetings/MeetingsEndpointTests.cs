using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using Portfolio.Api.Features.Alerts;
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
    public async Task Only_the_admin_gets_the_booking_link()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateBrowserClient().GetAsync("/api/meetings/info")).StatusCode);

        var info = await (await SignedInClientAsync()).GetFromJsonAsync<MeetingsInfo>("/api/meetings/info");

        Assert.Equal("https://cal.com/claomike/30min", info!.BookingUrl);
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
        var note = Assert.Single(factory.Emails.To(email));
        Assert.Contains("See you then!", note.Text);
        // The site receives email: their answer comes back to its address, into the Contact inbox.
        Assert.Null(note.ReplyTo);
    }

    [Fact]
    public async Task The_admin_cancels_a_booked_meeting_through_Cal_com_and_visitors_cant()
    {
        var uid = Guid.NewGuid().ToString();
        var email = $"grace-{Guid.NewGuid():N}@example.com";
        Assert.Equal(HttpStatusCode.OK, (await factory.CreateClient().SendAsync(Webhook("BOOKING_CREATED", uid, email))).StatusCode);
        var admin = await SignedInClientAsync();
        var id = (await admin.GetFromJsonAsync<List<MeetingDto>>("/api/meetings"))!.Single(m => m.AttendeeEmail == email).Id;

        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateBrowserClient().PostAsJsonAsync($"/api/meetings/{id}/cancel", new MeetingDecisionRequest(null))).StatusCode);
        Assert.DoesNotContain(factory.Cal.Calls, c => c.Contains(uid));

        var response = await admin.PostAsJsonAsync($"/api/meetings/{id}/cancel", new MeetingDecisionRequest("Something came up."));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(MeetingStatus.Cancelled, (await response.Content.ReadFromJsonAsync<MeetingDecisionResult>())!.Status);
        Assert.Contains($"cancel {uid} Something came up.", factory.Cal.Calls);
        Assert.Equal(MeetingStatus.Cancelled, (await admin.GetFromJsonAsync<List<MeetingDto>>("/api/meetings"))!.Single(m => m.Id == id).Status);
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
    public async Task The_phone_alert_s_button_declines_the_request_without_sign_in_once()
    {
        var uid = Guid.NewGuid().ToString();
        var email = $"ada-{Guid.NewGuid():N}@example.com";
        await factory.CreateClient().SendAsync(Webhook("BOOKING_REQUESTED", uid, email));
        // The tests in this collection run one at a time: the latest request is this one.
        var alert = factory.Alerts.All.Last(a => a.Kind == AlertKinds.MeetingRequest);
        var path = new Uri(alert.Actions![1].Url).PathAndQuery;

        var first = await factory.CreateClient().PostAsync(path, null);
        var again = await factory.CreateClient().PostAsync(path, null);

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(MeetingStatus.Declined, (await first.Content.ReadFromJsonAsync<MeetingDecisionResult>())!.Status);
        Assert.Contains($"decline {uid}", factory.Cal.Calls);
        // The token is spent once it's decided.
        Assert.Equal(HttpStatusCode.Unauthorized, again.StatusCode);
        Assert.Empty(factory.Emails.To(email));
    }

    [Fact]
    public async Task A_cancellation_takes_it_off_the_message_and_alerts_the_phone()
    {
        var uid = Guid.NewGuid().ToString();
        var email = $"cancel-{Guid.NewGuid():N}@example.com";
        await factory.CreateClient().SendAsync(Webhook("BOOKING_CREATED", uid, email));
        await factory.CreateBrowserClient().PostAsJsonAsync("/api/contact", new SendMessageRequest("Grace", email, new string('m', 120)));
        var admin = await SignedInClientAsync();
        var id = (await admin.GetFromJsonAsync<PagedResponse<ContactMessageSummary>>("/api/contact/messages?pageSize=50"))!.Items.First(m => m.Name == "Grace").Id;
        Assert.Single((await admin.GetFromJsonAsync<ContactMessageDetails>($"/api/contact/messages/{id}"))!.Meetings, m => m.AttendeeEmail == email);

        Assert.Equal(HttpStatusCode.OK, (await factory.CreateClient().SendAsync(Webhook("BOOKING_CANCELLED", uid, email))).StatusCode);

        var details = await admin.GetFromJsonAsync<ContactMessageDetails>($"/api/contact/messages/{id}");
        Assert.DoesNotContain(details!.Meetings, m => m.AttendeeEmail == email);
        Assert.Contains(factory.Alerts.All, a => a.Title == "Meeting cancelled: Grace");
    }

    [Fact]
    public async Task The_calendar_shows_a_chosen_month()
    {
        var uid = Guid.NewGuid().ToString();
        var email = $"month-{Guid.NewGuid():N}@example.com";
        await factory.CreateClient().SendAsync(Webhook("BOOKING_CREATED", uid, email));
        var admin = await SignedInClientAsync();
        var from = Uri.EscapeDataString(DateTimeOffset.UtcNow.AddDays(2).ToString("O"));
        var to = Uri.EscapeDataString(DateTimeOffset.UtcNow.AddDays(4).ToString("O"));
        var past = Uri.EscapeDataString(DateTimeOffset.UtcNow.AddDays(-40).ToString("O"));
        var pastEnd = Uri.EscapeDataString(DateTimeOffset.UtcNow.AddDays(-10).ToString("O"));

        Assert.Contains((await admin.GetFromJsonAsync<List<MeetingDto>>($"/api/meetings?from={from}&to={to}"))!, m => m.AttendeeEmail == email);
        Assert.DoesNotContain((await admin.GetFromJsonAsync<List<MeetingDto>>($"/api/meetings?from={past}&to={pastEnd}"))!, m => m.AttendeeEmail == email);
    }

    [Fact]
    public async Task The_admin_s_note_can_t_be_too_long()
    {
        var uid = Guid.NewGuid().ToString();
        var email = $"long-{Guid.NewGuid():N}@example.com";
        await factory.CreateClient().SendAsync(Webhook("BOOKING_REQUESTED", uid, email));
        var admin = await SignedInClientAsync();
        var id = (await admin.GetFromJsonAsync<List<MeetingDto>>("/api/meetings"))!.Single(m => m.AttendeeEmail == email).Id;

        var response = await admin.PostAsJsonAsync($"/api/meetings/{id}/accept", new MeetingDecisionRequest(new string('x', MeetingsEndpoints.MessageMaxLength + 1)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.DoesNotContain($"confirm {uid}", factory.Cal.Calls);
    }

    [Fact]
    public async Task A_webhook_that_isn_t_JSON_is_refused()
    {
        const string body = "not json";
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/meetings/cal") { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        request.Headers.Add("x-cal-signature-256", Convert.ToHexStringLower(HMACSHA256.HashData(Encoding.UTF8.GetBytes(PortfolioApiFactory.CalSecret), Encoding.UTF8.GetBytes(body))));

        Assert.Equal(HttpStatusCode.BadRequest, (await factory.CreateClient().SendAsync(request)).StatusCode);
    }

    [Fact]
    public async Task Deciding_a_meeting_that_doesn_t_exist_is_not_found()
    {
        var admin = await SignedInClientAsync();

        Assert.Equal(HttpStatusCode.NotFound, (await admin.PostAsJsonAsync("/api/meetings/999999/accept", new MeetingDecisionRequest(null))).StatusCode);
    }
}
