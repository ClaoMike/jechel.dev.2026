using System.Net;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.UnitTests.Features.YouTube;

namespace Portfolio.Api.UnitTests.Features.Alerts;

/// <summary>The Notifications tab: every kind of phone alert, switched on or off, and the history of what was raised.</summary>
public class NotificationsTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 22, 23, 0, 0, TimeSpan.Zero);

    private readonly FakeTimeProvider _time = new(Now);
    private readonly TestDatabase _database = new();
    private readonly PortfolioDbContext _db;
    private readonly AlertPreferences _preferences = new();

    public NotificationsTests() => _db = _database.Open();

    // ---------- The kinds ----------

    [Fact]
    public void Every_kind_has_its_own_key_a_label_and_one_of_four_groups()
    {
        Assert.Equal(AlertKinds.All.Count, AlertKinds.All.Select(k => k.Key).Distinct().Count());
        Assert.All(AlertKinds.All, k => Assert.False(string.IsNullOrWhiteSpace(k.Label)));
        Assert.Equal(["Visitors", "Community", "Problems", "Security"], AlertKinds.All.Select(k => k.Group).Distinct());
        // Listed group by group, never one group split in two.
        var groups = AlertKinds.All.Select(k => k.Group).ToList();
        Assert.Equal(groups.Distinct().Count(), groups.Where((g, i) => i == 0 || groups[i - 1] != g).Count());
    }

    [Fact]
    public void Every_constant_is_a_listed_kind_but_the_settings_test()
    {
        var constants = typeof(AlertKinds).GetFields().Where(f => f.IsLiteral).Select(f => (string)f.GetRawConstantValue()!).ToList();

        Assert.Equal(constants.Where(c => c != AlertKinds.Test).Order(), AlertKinds.All.Select(k => k.Key).Order());
        Assert.Null(AlertKinds.Find(AlertKinds.Test));
    }

    [Fact]
    public void Every_alert_the_site_raises_names_a_listed_kind()
    {
        // The API's source: each "new PhoneAlert(" is followed by an AlertKinds constant, so no alert escapes the switches.
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../src/Portfolio.Api"));
        var sources = Directory.EnumerateFiles(root, "*.cs", SearchOption.AllDirectories).Where(f => !f.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}") && !f.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}"));
        var kinds = new List<string>();
        foreach (var file in sources)
        {
            foreach (Match match in Regex.Matches(File.ReadAllText(file), @"new PhoneAlert\(\s*([^,\s]+)"))
            {
                Assert.StartsWith("AlertKinds.", match.Groups[1].Value);
                kinds.Add(match.Groups[1].Value["AlertKinds.".Length..]);
            }
        }
        var names = typeof(AlertKinds).GetFields().Where(f => f.IsLiteral).Select(f => f.Name).ToHashSet();
        Assert.All(kinds, k => Assert.Contains(k, names));
        // Every listed kind is raised somewhere: nothing in the tab that never comes.
        Assert.Equal(names.Order(), kinds.Distinct().Order());
    }

    // ---------- Switching kinds off ----------

    [Fact]
    public async Task Every_kind_is_on_until_switched_off()
    {
        await _preferences.ReloadAsync(_db, default);

        Assert.All(AlertKinds.All, k => Assert.True(_preferences.IsEnabled(k.Key)));
        Assert.True(_preferences.IsEnabled("something-new"));
    }

    private async Task<IReadOnlyList<NotificationKindDto>> Save(string kind, bool enabled) =>
        Assert.IsType<Ok<IReadOnlyList<NotificationKindDto>>>((await SaveNotificationKind.Handle(kind, new SaveNotificationKindRequest(enabled), _db, _preferences, _time, default)).Result).Value!;

    [Fact]
    public async Task Switching_a_kind_off_applies_at_once_and_on_again_too()
    {
        var kinds = await Save(AlertKinds.SiteError, false);

        Assert.False(_preferences.IsEnabled(AlertKinds.SiteError));
        Assert.True(_preferences.IsEnabled(AlertKinds.ApiCrash));
        Assert.False(Assert.Single(kinds, k => k.Kind == AlertKinds.SiteError).Enabled);
        Assert.All(kinds.Where(k => k.Kind != AlertKinds.SiteError), k => Assert.True(k.Enabled));

        await Save(AlertKinds.SiteError, true);
        Assert.True(_preferences.IsEnabled(AlertKinds.SiteError));
        Assert.Equal(Now, _db.AlertPreferences.Single().UpdatedAt);
    }

    [Fact]
    public async Task What_is_switched_off_is_kept_and_read_back_after_a_restart()
    {
        await Save(AlertKinds.Coffee, false);
        await Save(AlertKinds.SignIn, false);

        var afterRestart = new AlertPreferences();
        await afterRestart.ReloadAsync(_database.Open(), default);

        Assert.False(afterRestart.IsEnabled(AlertKinds.Coffee));
        Assert.False(afterRestart.IsEnabled(AlertKinds.SignIn));
        Assert.True(afterRestart.IsEnabled(AlertKinds.Message));
    }

    [Fact]
    public async Task A_save_that_doesnt_say_on_or_off_is_refused_never_read_as_off()
    {
        var missing = await SaveNotificationKind.Handle(AlertKinds.Message, new SaveNotificationKindRequest(null), _db, _preferences, _time, default);
        var noBody = await SaveNotificationKind.Handle(AlertKinds.Message, null!, _db, _preferences, _time, default);

        Assert.Equal(["enabled"], Assert.IsType<ValidationProblem>(missing.Result).ProblemDetails.Errors.Keys);
        Assert.IsType<ValidationProblem>(noBody.Result);
        Assert.Empty(_db.AlertPreferences);
        Assert.True(_preferences.IsEnabled(AlertKinds.Message));
    }

    [Fact]
    public async Task Saving_the_same_again_keeps_one_row_per_kind()
    {
        await Save(AlertKinds.Coffee, false);
        await Save(AlertKinds.Coffee, false);
        await Save(AlertKinds.Coffee, true);

        var row = Assert.Single(_db.AlertPreferences);
        Assert.Equal((AlertKinds.Coffee, true), (row.Kind, row.Enabled));
    }

    [Theory]
    [InlineData("nope")]
    [InlineData("test")]
    [InlineData("")]
    public async Task An_unknown_kind_is_not_found_and_nothing_is_kept(string kind)
    {
        var result = await SaveNotificationKind.Handle(kind, new SaveNotificationKindRequest(false), _db, _preferences, _time, default);

        Assert.IsType<NotFound>(result.Result);
        Assert.Empty(_db.AlertPreferences);
    }

    // ---------- The list of kinds ----------

    private void Log(string kind, DateTimeOffset at, string status = AlertStatus.Sent, string title = "T")
    {
        _db.PhoneAlertLogs.Add(new PhoneAlertLog { Kind = kind, Title = title, Message = "M", Status = status, CreatedAt = at });
        _db.SaveChanges();
    }

    [Fact]
    public async Task Lists_every_kind_in_order_with_how_many_came_in_30_days_and_when_the_last_did()
    {
        Log(AlertKinds.Message, Now.AddDays(-40));
        Log(AlertKinds.Message, Now.AddDays(-2));
        Log(AlertKinds.Message, Now.AddHours(-1), AlertStatus.Off);
        Log(AlertKinds.Coffee, Now.AddDays(-31));

        var kinds = (await ListNotificationKinds.Handle(_db, _time, default)).Value!;

        Assert.Equal(AlertKinds.All.Select(k => k.Key), kinds.Select(k => k.Kind));
        var message = kinds.Single(k => k.Kind == AlertKinds.Message);
        Assert.Equal((2, Now.AddHours(-1), "New message", "Visitors"), (message.Last30Days, message.LastAt, message.Label, message.Group));
        var coffee = kinds.Single(k => k.Kind == AlertKinds.Coffee);
        Assert.Equal((0, Now.AddDays(-31)), (coffee.Last30Days, coffee.LastAt));
        Assert.Null(kinds.Single(k => k.Kind == AlertKinds.ApiCrash).LastAt);
    }

    // ---------- The history ----------

    [Fact]
    public async Task The_history_is_newest_first_a_page_at_a_time_of_every_kind_or_one()
    {
        for (var i = 0; i < 25; i++) Log(i % 5 == 0 ? AlertKinds.Coffee : AlertKinds.Message, Now.AddMinutes(-i), title: $"#{i}");

        var first = (await ListNotifications.Handle(_db, default, pageSize: 10)).Value!;
        var third = (await ListNotifications.Handle(_db, default, page: 3, pageSize: 10)).Value!;
        var coffee = (await ListNotifications.Handle(_db, default, kind: AlertKinds.Coffee)).Value!;
        var none = (await ListNotifications.Handle(_db, default, kind: AlertKinds.ApiCrash)).Value!;

        Assert.Equal(["#0", "#1", "#2"], first.Items.Take(3).Select(n => n.Title));
        Assert.Equal(25, first.TotalCount);
        Assert.Equal(5, third.Items.Count);
        Assert.Equal(["#0", "#5", "#10", "#15", "#20"], coffee.Items.Select(n => n.Title));
        Assert.Equal(5, coffee.TotalCount);
        Assert.Empty(none.Items);
    }

    [Theory]
    [InlineData(0, 0, 1, 1)]
    [InlineData(-2, 999, 1, NotificationsShared.MaxPageSize)]
    public async Task Pages_out_of_range_are_brought_into_it(int page, int pageSize, int expectedPage, int expectedSize)
    {
        var list = (await ListNotifications.Handle(_db, default, page: page, pageSize: pageSize)).Value!;

        Assert.Equal((expectedPage, expectedSize), (list.Page, list.PageSize));
    }

    // ---------- The worker: sending, holding back, and writing it all down ----------

    private sealed class FakeNtfy(Func<string, HttpStatusCode>? answer = null) : HttpMessageHandler
    {
        public List<string> Titles { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var title = (string)System.Text.Json.Nodes.JsonNode.Parse(await request.Content!.ReadAsStringAsync(cancellationToken))!["title"]!;
            lock (Titles) Titles.Add(title);
            return new HttpResponseMessage(answer?.Invoke(title) ?? HttpStatusCode.OK);
        }
    }

    private sealed class Clients(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    /// <summary>Runs the worker over these alerts, then stops it once all are written down.</summary>
    private async Task<FakeNtfy> Run(IEnumerable<PhoneAlert> raised, string topic = "jechel-abc", Func<string, HttpStatusCode>? answer = null)
    {
        var ntfy = new FakeNtfy(answer);
        var alerts = new PhoneAlerts(_time);
        var sender = new NtfySender(new Clients(ntfy), TestOptions.Monitor(new AlertOptions { NtfyTopic = topic }), Options.Create(new SiteOptions()), NullLogger<NtfySender>.Instance);
        var worker = new AlertWorker(alerts, sender, TestWebPush.Sender(_database.Scopes, _time), _preferences, _database.Scopes, _time, NullLogger<AlertWorker>.Instance);
        var list = raised.ToList();
        var lastId = _database.Open().PhoneAlertLogs.Select(a => (long?)a.Id).Max() ?? 0;

        await worker.StartAsync(default);
        foreach (var alert in list) alerts.Send(alert);
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (_database.Open().PhoneAlertLogs.Count(a => a.Id > lastId) < list.Count && DateTime.UtcNow < deadline) await Task.Delay(10);
        await worker.StopAsync(default);
        return ntfy;
    }

    private List<PhoneAlertLog> History() => [.. _database.Open().PhoneAlertLogs.OrderBy(a => a.Id)];

    [Fact]
    public async Task Sends_what_is_on_holds_back_what_is_off_and_writes_both_down()
    {
        await Save(AlertKinds.SiteError, false);

        var ntfy = await Run([
            new PhoneAlert(AlertKinds.Message, "New message from Ada", "Hello", "/contact"),
            new PhoneAlert(AlertKinds.SiteError, "Site error", "TypeError"),
        ]);

        Assert.Equal(["New message from Ada"], ntfy.Titles);
        Assert.Equal(
            [(AlertKinds.Message, "New message from Ada", "Hello", "/contact", AlertStatus.Sent), (AlertKinds.SiteError, "Site error", "TypeError", null, AlertStatus.Off)],
            History().Select(a => (a.Kind, a.Title, a.Message, a.Path, a.Status)));
        Assert.All(History(), a => Assert.Equal(Now, a.CreatedAt));
    }

    [Fact]
    public async Task Says_when_ntfy_isnt_set_up_and_when_it_refused()
    {
        await Run([new PhoneAlert(AlertKinds.Coffee, "☕ 3 GBP from Jo", "Thanks")], topic: "");
        await Run([new PhoneAlert(AlertKinds.Coffee, "Refused", "x"), new PhoneAlert(AlertKinds.Coffee, "Fine", "y")], answer: t => t == "Refused" ? HttpStatusCode.Forbidden : HttpStatusCode.OK);

        Assert.Equal([AlertStatus.NotSetUp, AlertStatus.Failed, AlertStatus.Sent], History().Select(a => a.Status));
    }

    [Fact]
    public async Task Writes_down_long_text_cut_to_fit_and_leaves_out_an_overlong_link()
    {
        await Run([new PhoneAlert(AlertKinds.ApiCrash, new string('t', 300), new string('m', 3000), "/" + new string('p', 300))]);

        var entry = Assert.Single(History());
        Assert.Equal((200, 1000), (entry.Title.Length, entry.Message.Length));
        Assert.Null(entry.Path);
    }

    [Fact]
    public async Task Keeps_90_days_of_history()
    {
        Log(AlertKinds.Message, Now - AlertWorker.KeptFor - TimeSpan.FromMinutes(1), title: "old");
        Log(AlertKinds.Message, Now - AlertWorker.KeptFor + TimeSpan.FromMinutes(1), title: "recent");

        await Run([new PhoneAlert(AlertKinds.Message, "new", "m")]);

        Assert.Equal(["recent", "new"], History().Select(a => a.Title));
    }
}
