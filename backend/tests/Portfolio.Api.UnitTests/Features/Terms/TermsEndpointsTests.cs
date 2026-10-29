using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.Terms;

namespace Portfolio.Api.UnitTests.Features.Terms;

public class TermsEndpointsTests
{
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 12, 12, 0, 0, TimeSpan.Zero));
    private readonly PortfolioDbContext _db = new(new DbContextOptionsBuilder<PortfolioDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    [Fact]
    public async Task GetTerms_returns_the_defaults_with_their_own_date_before_the_first_save()
    {
        var terms = (await GetTerms.Handle(_db, CancellationToken.None)).Value!;

        Assert.Equal(TermsDefaults.Content.Title, terms.Title);
        Assert.Equal(TermsDefaults.Content.Sections.Count, terms.Sections.Count);
        // The date is the version visitors accept: changing the defaults (and their date) asks everyone again.
        Assert.Equal(TermsDefaults.UpdatedAt, terms.UpdatedAt);
    }

    /// <summary>Every kind of event the tracker records (AnalyticsRules.EventTypes), and words the terms use for it.</summary>
    [Theory]
    [InlineData("pageview", "the pages you open")]
    [InlineData("click", "what you click")]
    [InlineData("key", "pressing Escape")]
    [InlineData("change", "the fields you change")]
    [InlineData("submit", "when you send a form")]
    [InlineData("event", "what you do with the forms")]
    [InlineData("scroll", "how far down each page you scroll")]
    [InlineData("tab", "switch to another tab")]
    [InlineData("error", "errors on the page")]
    [InlineData("leave", "when you leave")]
    public void The_default_terms_say_what_is_recorded(string type, string words)
    {
        Assert.Contains(type, Portfolio.Api.Features.Analytics.AnalyticsRules.EventTypes);
        var recorded = TermsDefaults.Content.Sections.Single(s => s.Heading == "What is recorded when you visit");
        Assert.Contains(recorded.Blocks.SelectMany(b => b.Items), item => item.Contains(words));
    }

    [Fact]
    public void A_new_kind_of_event_needs_a_line_in_the_terms_above() =>
        Assert.Equal(10, Portfolio.Api.Features.Analytics.AnalyticsRules.EventTypes.Count);

    [Fact]
    public void The_default_terms_can_be_saved_unchanged_in_the_editor() =>
        Assert.Empty(TermsRules.Validate(TermsDefaults.Content));

    /// <summary>All of the default terms' text, to check what they say.</summary>
    private static string DefaultText() => string.Join("\n",
        new[] { TermsDefaults.Content.Intro }.Concat(TermsDefaults.Content.Sections.SelectMany(s =>
            new[] { s.Heading }.Concat(s.Blocks.SelectMany(b => new[] { b.Text }.Concat(b.Items))))));

    [Fact]
    public void The_default_terms_say_how_long_visits_are_kept_as_long_as_they_are() =>
        Assert.Contains($"deleted automatically {TermsDefaults.VisitRetentionMonths} months after the visit", DefaultText());

    [Theory]
    // Every key the site keeps in a visitor's browser (frontend: theme.ts, acceptance.ts, EditableSection, useScrollMemory, tracker.ts).
    [InlineData("terms.accepted")]
    [InlineData("theme")]
    [InlineData("theme.slowDevice")]
    [InlineData("about.collapsed.")]
    [InlineData("scroll.positions")]
    [InlineData("analytics.session")]
    // Every service a visitor's data passes through.
    [InlineData("Cloudflare")]
    [InlineData("Sliplane")]
    [InlineData("Meetings are by invitation")]
    [InlineData("an email you send to the website's address")]
    [InlineData("Resend")]
    [InlineData("ntfy.sh")]
    [InlineData("youtube-nocookie.com")]
    [InlineData("Cal.com")]
    [InlineData("Buy Me a Coffee")]
    // Apps: their media from elsewhere, and the stores they're offered in.
    [InlineData("an app's images and videos may come from")]
    [InlineData("App Store, Google Play and Steam")]
    // How to use your rights, and where to complain.
    [InlineData("[Contact](/contact)")]
    [InlineData("ico.org.uk")]
    public void The_default_terms_name_what_the_site_keeps_and_who_handles_it(string mentioned) =>
        Assert.Contains(mentioned, DefaultText());

    [Fact]
    public void The_default_terms_say_the_IP_address_isnt_stored_and_nothing_is_recorded_before_accepting()
    {
        var text = DefaultText();
        Assert.Contains("Your IP address itself is not stored", text);
        Assert.Contains("Nothing is recorded before you accept", text);
    }

    [Fact]
    public async Task UpdateTerms_stores_the_normalized_terms_with_the_date_and_GetTerms_returns_them()
    {
        var content = new TermsContent(" House rules ", "", [new TermsSection("Be nice", [new TermsBlock(TermsBlockKinds.Bullets, "", ["No spam", " "])])]);

        var saved = await UpdateTerms.Handle(content, _db, _time, CancellationToken.None);

        var ok = Assert.IsType<Ok<TermsDocument>>(saved.Result);
        Assert.Equal(("House rules", _time.GetUtcNow()), (ok.Value!.Title, ok.Value.UpdatedAt));
        var loaded = (await GetTerms.Handle(_db, CancellationToken.None)).Value!;
        Assert.Equal("House rules", loaded.Title);
        Assert.Equal(["No spam"], Assert.Single(Assert.Single(loaded.Sections).Blocks).Items);
        Assert.Equal(_time.GetUtcNow(), loaded.UpdatedAt);
    }

    [Fact]
    public async Task UpdateTerms_replaces_the_previous_version_and_moves_the_date()
    {
        await UpdateTerms.Handle(TermsDefaults.Content, _db, _time, CancellationToken.None);
        _time.Advance(TimeSpan.FromDays(1));

        await UpdateTerms.Handle(TermsDefaults.Content with { Sections = [] }, _db, _time, CancellationToken.None);

        Assert.Single(_db.TermsPages);
        var loaded = (await GetTerms.Handle(_db, CancellationToken.None)).Value!;
        Assert.Empty(loaded.Sections);
        Assert.Equal(_time.GetUtcNow(), loaded.UpdatedAt);
    }

    [Fact]
    public async Task UpdateTerms_rejects_invalid_terms_and_keeps_the_old_ones()
    {
        var result = await UpdateTerms.Handle(TermsDefaults.Content with { Title = "" }, _db, _time, CancellationToken.None);

        var problem = Assert.IsType<ValidationProblem>(result.Result);
        Assert.Equal(["title"], problem.ProblemDetails.Errors.Keys);
        Assert.Empty(_db.TermsPages);
    }
}
