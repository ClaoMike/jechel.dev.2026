using System.Buffers.Binary;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.UnitTests.Features.YouTube;

namespace Portfolio.Api.UnitTests.Features.Alerts;

/// <summary>
/// The site's own notifications (Web Push): the site's keys, each alert encrypted for each device and signed, devices
/// their push service no longer knows forgotten, the switches for each way alerts go, and the devices' endpoints.
/// Each notification is decrypted here with the device's own key, as the phone does, to read what it says.
/// </summary>
public class WebPushTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 24, 18, 0, 0, TimeSpan.Zero);

    private readonly FakeTimeProvider _time = new(Now);
    private readonly TestDatabase _database = new();
    private readonly FakePushService _service = new();

    private WebPushSender Sender() => TestWebPush.Sender(_database.Scopes, _time, _service);

    // ---------- The site's keys ----------

    [Fact]
    public void Makes_a_P256_key_pair_as_push_services_take_it()
    {
        var keys = WebPushSender.NewKeys(Now);

        var publicKey = FromBase64Url(keys.PublicKey);
        Assert.Equal(65, publicKey.Length);
        Assert.Equal(0x04, publicKey[0]);
        Assert.Equal(32, FromBase64Url(keys.PrivateKey).Length);
        Assert.DoesNotContain('=', keys.PublicKey + keys.PrivateKey);
        Assert.NotEqual(keys.PublicKey, WebPushSender.NewKeys(Now).PublicKey);
    }

    [Fact]
    public async Task Makes_the_keys_once_and_keeps_them_across_restarts()
    {
        var first = await Sender().KeysAsync(default);
        var again = await Sender().KeysAsync(default);

        Assert.Equal(first.PublicKey, again.PublicKey);
        Assert.Equal(first.PrivateKey, again.PrivateKey);
        Assert.Single(_database.Open().WebPushKeys);
    }

    // ---------- Sending ----------

    [Fact]
    public async Task Without_a_device_sends_nothing()
    {
        Assert.Equal(PushResult.NoDevices, await Sender().SendAsync(new PhoneAlert(AlertKinds.Message, "T", "M"), default));
        Assert.Empty(_service.Received);
    }

    [Fact]
    public async Task Sends_every_device_the_alert_encrypted_for_it_signed_with_the_sites_key()
    {
        var phone = AddDevice("iPhone · Safari", "https://web.push.apple.com/abc");
        var laptop = AddDevice("Mac · Chrome", "https://fcm.googleapis.com/fcm/send/xyz");
        var sender = Sender();

        var result = await sender.SendAsync(new PhoneAlert(AlertKinds.Message, "New message from Ada", "Hello there", "/contact", AlertPriority.High), default);

        Assert.Equal(PushResult.Sent, result);
        Assert.Equal(["https://web.push.apple.com/abc", "https://fcm.googleapis.com/fcm/send/xyz"], _service.Received.Select(r => r.Url).Order(StringComparer.Ordinal).Reverse());
        var keys = await sender.KeysAsync(default);
        foreach (var (device, received) in new[] { (phone, _service.For(phone.Endpoint)), (laptop, _service.For(laptop.Endpoint)) })
        {
            // Signed: a token, and the site's public key, which the device allowed.
            Assert.Equal("vapid", received.Authorization!.Scheme);
            Assert.Contains($"k={keys.PublicKey}", received.Authorization.Parameter);
            Assert.Matches("t=[^.]+\\.[^.]+\\.[^,]+", received.Authorization.Parameter);
            Assert.Equal("aes128gcm", received.ContentEncoding);
            Assert.Equal("86400", received.Ttl);
            Assert.Equal("high", received.Urgency);

            var payload = JsonDocument.Parse(device.Decrypt(received.Body)).RootElement;
            Assert.Equal("New message from Ada", payload.GetProperty("title").GetString());
            Assert.Equal("Hello there", payload.GetProperty("body").GetString());
            Assert.Equal("https://jechel.dev/contact", payload.GetProperty("url").GetString());
        }
        Assert.All(_database.Open().PushDevices, d => Assert.Equal(Now, d.LastSentAt));
    }

    [Fact]
    public async Task An_ordinary_alert_isnt_urgent_and_without_a_page_opens_the_site()
    {
        var phone = AddDevice("iPhone", "https://web.push.apple.com/abc");

        await Sender().SendAsync(new PhoneAlert(AlertKinds.Message, "T", "M"), default);

        var received = Assert.Single(_service.Received);
        // Normal is what no Urgency header means (RFC 8030).
        Assert.Null(received.Urgency);
        Assert.Equal("https://jechel.dev/", JsonDocument.Parse(phone.Decrypt(received.Body)).RootElement.GetProperty("url").GetString());
    }

    [Theory]
    [InlineData(HttpStatusCode.Gone)]
    [InlineData(HttpStatusCode.NotFound)]
    public async Task Forgets_a_device_its_push_service_no_longer_knows(HttpStatusCode answer)
    {
        AddDevice("Old phone", "https://web.push.apple.com/old");
        AddDevice("iPhone", "https://web.push.apple.com/new");
        _service.Answers["https://web.push.apple.com/old"] = answer;

        Assert.Equal(PushResult.Sent, await Sender().SendAsync(new PhoneAlert(AlertKinds.Message, "T", "M"), default));

        Assert.Equal(["iPhone"], _database.Open().PushDevices.Select(d => d.Label));
    }

    [Fact]
    public async Task Fails_when_no_device_took_it_and_keeps_a_device_whose_service_is_only_down()
    {
        AddDevice("iPhone", "https://web.push.apple.com/abc");
        _service.Answers["https://web.push.apple.com/abc"] = HttpStatusCode.InternalServerError;

        Assert.Equal(PushResult.Failed, await Sender().SendAsync(new PhoneAlert(AlertKinds.Message, "T", "M"), default));

        var device = Assert.Single(_database.Open().PushDevices);
        Assert.Null(device.LastSentAt);
    }

    [Fact]
    public void Signs_as_the_site_or_a_mailto_where_its_address_isnt_https()
    {
        Assert.Equal("https://jechel.dev", WebPushSender.Subject(new SiteOptions { PublicUrl = "https://jechel.dev/" }));
        Assert.Equal("mailto:alerts@jechel.dev", WebPushSender.Subject(new SiteOptions { PublicUrl = "http://localhost:5173" }));
    }

    // ---------- Both ways, switched on and off ----------

    [Fact]
    public async Task Sends_an_alert_both_ways_and_records_both()
    {
        AddDevice("iPhone", "https://web.push.apple.com/abc");

        var history = await RunWorker(new PhoneAlert(AlertKinds.Message, "New message", "Hi"));

        Assert.Equal((AlertStatus.Sent, "ntfy,push"), (history.Status, history.SentTo));
        Assert.Single(_service.Received);
        Assert.Single(_ntfy.Titles);
    }

    [Fact]
    public async Task Sends_only_the_ways_switched_on()
    {
        AddDevice("iPhone", "https://web.push.apple.com/abc");
        await SwitchChannel(AlertChannels.Ntfy, false);

        var history = await RunWorker(new PhoneAlert(AlertKinds.Message, "New message", "Hi"));

        Assert.Equal((AlertStatus.Sent, "push"), (history.Status, history.SentTo));
        Assert.Empty(_ntfy.Titles);
    }

    [Fact]
    public async Task With_both_ways_off_sends_nothing_and_says_so()
    {
        AddDevice("iPhone", "https://web.push.apple.com/abc");
        await SwitchChannel(AlertChannels.Ntfy, false);
        await SwitchChannel(AlertChannels.Push, false);

        var history = await RunWorker(new PhoneAlert(AlertKinds.Message, "New message", "Hi"));

        Assert.Equal((AlertStatus.NoChannel, null), (history.Status, history.SentTo));
        Assert.Empty(_service.Received);
        Assert.Empty(_ntfy.Titles);
    }

    [Fact]
    public async Task One_way_failing_still_counts_as_sent_by_the_other()
    {
        AddDevice("iPhone", "https://web.push.apple.com/abc");
        _service.Answers["https://web.push.apple.com/abc"] = HttpStatusCode.InternalServerError;

        var history = await RunWorker(new PhoneAlert(AlertKinds.Message, "New message", "Hi"));

        Assert.Equal((AlertStatus.Sent, "ntfy"), (history.Status, history.SentTo));
    }

    [Fact]
    public async Task Failed_when_one_way_failed_and_the_other_isnt_set_up()
    {
        AddDevice("iPhone", "https://web.push.apple.com/abc");
        _service.Answers["https://web.push.apple.com/abc"] = HttpStatusCode.InternalServerError;

        var history = await RunWorker(new PhoneAlert(AlertKinds.Message, "New message", "Hi"), ntfyTopic: "");

        Assert.Equal((AlertStatus.Failed, null), (history.Status, history.SentTo));
    }

    [Fact]
    public async Task Not_set_up_when_neither_way_can_send_yet()
    {
        var history = await RunWorker(new PhoneAlert(AlertKinds.Message, "New message", "Hi"), ntfyTopic: "");

        Assert.Equal((AlertStatus.NotSetUp, null), (history.Status, history.SentTo));
    }

    [Fact]
    public async Task A_kind_switched_off_goes_neither_way()
    {
        AddDevice("iPhone", "https://web.push.apple.com/abc");
        var db = _database.Open();
        db.AlertPreferences.Add(new AlertPreference { Kind = AlertKinds.Message, Enabled = false });
        await db.SaveChangesAsync();
        await _preferences.ReloadAsync(db, default);

        var history = await RunWorker(new PhoneAlert(AlertKinds.Message, "New message", "Hi"));

        Assert.Equal(AlertStatus.Off, history.Status);
        Assert.Empty(_service.Received);
    }

    // ---------- The endpoints ----------

    [Fact]
    public async Task Lists_both_ways_on_at_first_and_whether_each_can_send()
    {
        var channels = (await ListAlertChannels.Handle(_database.Open(), TestOptions.Monitor(new AlertOptions()), default)).Value!;
        Assert.Equal([new AlertChannelDto("ntfy", true, false), new AlertChannelDto("push", true, false)], channels);

        AddDevice("iPhone", "https://web.push.apple.com/abc");
        channels = (await ListAlertChannels.Handle(_database.Open(), TestOptions.Monitor(new AlertOptions { NtfyTopic = "t" }), default)).Value!;
        Assert.Equal([new AlertChannelDto("ntfy", true, true), new AlertChannelDto("push", true, true)], channels);
    }

    [Fact]
    public async Task Switches_a_way_off_and_on_at_once_for_the_next_alert()
    {
        var off = await SwitchChannel(AlertChannels.Push, false);
        Assert.Equal([true, false], Assert.IsType<Ok<IReadOnlyList<AlertChannelDto>>>(off.Result).Value!.Select(c => c.Enabled));
        Assert.False(_preferences.IsChannelEnabled(AlertChannels.Push));

        await SwitchChannel(AlertChannels.Push, true);
        Assert.True(_preferences.IsChannelEnabled(AlertChannels.Push));
        Assert.True(Assert.Single(_database.Open().AlertChannels).Enabled);
    }

    [Fact]
    public async Task Refuses_an_unknown_way_or_a_body_without_on_or_off()
    {
        var db = _database.Open();
        var ntfy = TestOptions.Monitor(new AlertOptions());
        Assert.IsType<NotFound>((await SaveAlertChannel.Handle("email", new SaveAlertChannelRequest(true), db, _preferences, ntfy, _time, default)).Result);
        Assert.IsType<ValidationProblem>((await SaveAlertChannel.Handle("push", new SaveAlertChannelRequest(null), db, _preferences, ntfy, _time, default)).Result);
        Assert.Empty(db.AlertChannels);
    }

    [Fact]
    public async Task Gives_the_sites_key_and_the_devices_newest_first()
    {
        AddDevice("Mac · Chrome", "https://fcm.googleapis.com/a");
        _time.Advance(TimeSpan.FromMinutes(1));
        AddDevice("iPhone · Safari", "https://web.push.apple.com/b");
        var sender = Sender();

        var setup = (await GetPushSetup.Handle(_database.Open(), sender, default)).Value!;

        Assert.Equal((await sender.KeysAsync(default)).PublicKey, setup.PublicKey);
        Assert.Equal(["iPhone · Safari", "Mac · Chrome"], setup.Devices.Select(d => d.Label));
    }

    [Fact]
    public async Task Keeps_a_device_that_allowed_notifications_and_updates_one_it_knows()
    {
        var device = new TestDevice("https://web.push.apple.com/abc");
        var added = await AddPushDevice.Handle(device.Request("  iPhone · Safari  "), _database.Open(), Production, _time, default);
        Assert.Equal(["iPhone · Safari"], Assert.IsType<Ok<IReadOnlyList<PushDeviceDto>>>(added.Result).Value!.Select(d => d.Label));

        // Allowed again (after the keys changed): the same device, new keys.
        var renewed = new TestDevice("https://web.push.apple.com/abc");
        await AddPushDevice.Handle(renewed.Request(""), _database.Open(), Production, _time, default);

        var kept = Assert.Single(_database.Open().PushDevices);
        Assert.Equal((renewed.P256dh, "A browser"), (kept.P256dh, kept.Label));
    }

    [Theory]
    [InlineData("http://web.push.apple.com/abc")]
    [InlineData("http://localhost:5299/push/1")]
    [InlineData("not a url")]
    [InlineData("")]
    [InlineData("ftp://web.push.apple.com/abc")]
    public void Refuses_a_push_address_that_isnt_https(string endpoint)
    {
        var errors = PushShared.Validate(new TestDevice(endpoint).Request("x"), Production);

        Assert.Equal(["endpoint"], errors.Keys);
    }

    [Fact]
    public void Takes_a_plain_http_address_on_this_computer_only_in_development_and_the_end_to_end_tests()
    {
        var local = new TestDevice("http://localhost:5299/push/1").Request("x");
        Assert.Empty(PushShared.Validate(local, Environment(Environments.Development)));
        Assert.Empty(PushShared.Validate(local, Environment("E2E")));
        Assert.Equal(["endpoint"], PushShared.Validate(new TestDevice("http://example.com/push").Request("x"), Environment("E2E")).Keys);
    }

    [Fact]
    public void Refuses_a_device_without_its_keys()
    {
        var errors = PushShared.Validate(new AddPushDeviceRequest("https://web.push.apple.com/abc", new PushKeysRequest(" ", null), "x"), Production);

        Assert.Equal(["keys.auth", "keys.p256dh"], errors.Keys.Order());
    }

    [Fact]
    public async Task Removes_a_device()
    {
        var gone = AddDevice("Old", "https://web.push.apple.com/old");
        AddDevice("New", "https://web.push.apple.com/new");
        var id = _database.Open().PushDevices.Single(d => d.Label == "Old").Id;

        var removed = await RemovePushDevice.Handle(id, _database.Open(), default);

        Assert.Equal(["New"], Assert.IsType<Ok<IReadOnlyList<PushDeviceDto>>>(removed.Result).Value!.Select(d => d.Label));
        Assert.IsType<NotFound>((await RemovePushDevice.Handle(id, _database.Open(), default)).Result);
        Assert.NotNull(gone);
    }

    [Fact]
    public async Task Tests_one_device_and_says_when_it_failed()
    {
        var phone = AddDevice("iPhone", "https://web.push.apple.com/abc");
        AddDevice("Mac", "https://fcm.googleapis.com/x");
        var db = _database.Open();
        var id = db.PushDevices.Single(d => d.Label == "iPhone").Id;

        Assert.IsType<NoContent>((await TestPushDevice.Handle(id, db, Sender(), default)).Result);
        var received = Assert.Single(_service.Received);
        Assert.Equal("It works!", JsonDocument.Parse(phone.Decrypt(received.Body)).RootElement.GetProperty("title").GetString());
        Assert.Equal(Now, _database.Open().PushDevices.Single(d => d.Id == id).LastSentAt);

        _service.Answers["https://web.push.apple.com/abc"] = HttpStatusCode.InternalServerError;
        var failed = Assert.IsType<ProblemHttpResult>((await TestPushDevice.Handle(id, _database.Open(), Sender(), default)).Result);
        Assert.Equal(502, failed.StatusCode);
        Assert.IsType<NotFound>((await TestPushDevice.Handle(999, _database.Open(), Sender(), default)).Result);
    }

    // ---------- Helpers ----------

    private readonly AlertPreferences _preferences = new();
    private readonly NtfyTitles _ntfy = new();

    private static readonly IHostEnvironment Production = Environment(Environments.Production);

    private static IHostEnvironment Environment(string name) => new TestEnvironment { EnvironmentName = name };

    private TestDevice AddDevice(string label, string endpoint)
    {
        var device = new TestDevice(endpoint);
        var db = _database.Open();
        db.PushDevices.Add(new PushDevice { Endpoint = endpoint, P256dh = device.P256dh, Auth = device.Auth, Label = label, CreatedAt = _time.GetUtcNow() });
        db.SaveChanges();
        return device;
    }

    private async Task<Results<Ok<IReadOnlyList<AlertChannelDto>>, NotFound, ValidationProblem>> SwitchChannel(string channel, bool on) =>
        await SaveAlertChannel.Handle(channel, new SaveAlertChannelRequest(on), _database.Open(), _preferences, TestOptions.Monitor(new AlertOptions()), _time, default);

    /// <summary>Runs the worker over one alert (ntfy answers OK), and gives what the history recorded.</summary>
    private async Task<PhoneAlertLog> RunWorker(PhoneAlert alert, string ntfyTopic = "jechel-abc")
    {
        var alerts = new PhoneAlerts(_time);
        var ntfy = new NtfySender(new Clients(_ntfy), TestOptions.Monitor(new AlertOptions { NtfyTopic = ntfyTopic }), Options.Create(new SiteOptions()), NullLogger<NtfySender>.Instance);
        var worker = new AlertWorker(alerts, ntfy, Sender(), _preferences, _database.Scopes, _time, NullLogger<AlertWorker>.Instance);

        await worker.StartAsync(default);
        alerts.Send(alert);
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (!_database.Open().PhoneAlertLogs.Any() && DateTime.UtcNow < deadline) await Task.Delay(10);
        await worker.StopAsync(default);
        return await _database.Open().PhoneAlertLogs.SingleAsync();
    }

    private static byte[] FromBase64Url(string value) =>
        Convert.FromBase64String(value.Replace('-', '+').Replace('_', '/') + new string('=', (4 - value.Length % 4) % 4));

    private sealed class Clients(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class TestEnvironment : IHostEnvironment, IWebHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ApplicationName { get; set; } = "Portfolio.Api";
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = "";
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
    }

    /// <summary>ntfy, answering OK to everything, and what it was sent.</summary>
    private sealed class NtfyTitles : HttpMessageHandler
    {
        public List<string> Titles { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Titles.Add(JsonDocument.Parse(await request.Content!.ReadAsStringAsync(cancellationToken)).RootElement.GetProperty("title").GetString()!);
            return new HttpResponseMessage(HttpStatusCode.OK);
        }
    }

    /// <summary>A push service: keeps what it's posted, and answers 201 (or what <see cref="Answers"/> says for an address).</summary>
    private sealed class FakePushService : HttpMessageHandler
    {
        public record Request(string Url, System.Net.Http.Headers.AuthenticationHeaderValue? Authorization, string? ContentEncoding, string? Ttl, string? Urgency, byte[] Body);

        public List<Request> Received { get; } = [];
        public Dictionary<string, HttpStatusCode> Answers { get; } = [];

        public Request For(string url) => Received.Single(r => r.Url == url);

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var url = request.RequestUri!.ToString();
            Received.Add(new Request(
                url,
                request.Headers.Authorization,
                request.Content?.Headers.ContentEncoding.FirstOrDefault(),
                request.Headers.TryGetValues("TTL", out var ttl) ? ttl.First() : null,
                request.Headers.TryGetValues("Urgency", out var urgency) ? urgency.First() : null,
                await request.Content!.ReadAsByteArrayAsync(cancellationToken)));
            return new HttpResponseMessage(Answers.GetValueOrDefault(url, HttpStatusCode.Created));
        }
    }

    /// <summary>A browser's side of Web Push: its key pair and secret, and the decryption a phone does (RFC 8291, aes128gcm).</summary>
    private sealed class TestDevice
    {
        private readonly ECDiffieHellman _key = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);
        private readonly byte[] _publicKey;
        private readonly byte[] _secret = RandomNumberGenerator.GetBytes(16);

        public TestDevice(string endpoint)
        {
            Endpoint = endpoint;
            var parameters = _key.ExportParameters(false);
            _publicKey = [0x04, .. parameters.Q.X!, .. parameters.Q.Y!];
        }

        public string Endpoint { get; }
        public string P256dh => Base64Url(_publicKey);
        public string Auth => Base64Url(_secret);

        public AddPushDeviceRequest Request(string label) => new(Endpoint, new PushKeysRequest(P256dh, Auth), label);

        public string Decrypt(byte[] body)
        {
            var salt = body[..16];
            var recordSize = BinaryPrimitives.ReadUInt32BigEndian(body.AsSpan(16, 4));
            Assert.True(recordSize >= 18);
            int keyLength = body[20];
            var senderKey = body[21..(21 + keyLength)];
            var cipherText = body[(21 + keyLength)..];

            using var sender = ECDiffieHellman.Create(new ECParameters { Curve = ECCurve.NamedCurves.nistP256, Q = new ECPoint { X = senderKey[1..33], Y = senderKey[33..65] } });
            var shared = _key.DeriveRawSecretAgreement(sender.PublicKey);
            byte[] keyInfo = [.. "WebPush: info\0"u8, .. _publicKey, .. senderKey];
            var inputKey = HKDF.DeriveKey(HashAlgorithmName.SHA256, shared, 32, _secret, keyInfo);
            var contentKey = HKDF.DeriveKey(HashAlgorithmName.SHA256, inputKey, 16, salt, "Content-Encoding: aes128gcm\0"u8.ToArray());
            var nonce = HKDF.DeriveKey(HashAlgorithmName.SHA256, inputKey, 12, salt, "Content-Encoding: nonce\0"u8.ToArray());

            var plain = new byte[cipherText.Length - 16];
            using var aes = new AesGcm(contentKey, 16);
            aes.Decrypt(nonce, cipherText[..^16], cipherText[^16..], plain);
            // The last record ends with 0x02, then any padding of zeros.
            var end = Array.LastIndexOf(plain, (byte)0x02);
            Assert.True(end >= 0 && plain[(end + 1)..].All(b => b == 0));
            return Encoding.UTF8.GetString(plain, 0, end);
        }

        private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
