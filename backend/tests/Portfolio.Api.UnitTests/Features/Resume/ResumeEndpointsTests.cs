using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.About;
using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.LeetCode;
using Portfolio.Api.Features.Resume;
using UglyToad.PdfPig;

namespace Portfolio.Api.UnitTests.Features.Resume;

public class ResumeEndpointsTests
{
    private const string Phone = "+44 7700 900123";

    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 21, 9, 30, 0, TimeSpan.Zero));
    private readonly PortfolioDbContext _db = new(new DbContextOptionsBuilder<PortfolioDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    private readonly FakeLeetCode _leetCode = new();
    private static readonly IOptions<SiteOptions> Site = Options.Create(new SiteOptions { PublicUrl = "https://jechel.dev/" });

    private LeetCodeStatsService LeetCode => new(_db, _leetCode, new LeetCodeMemoryCache(), _time, NullLogger<LeetCodeStatsService>.Instance);

    private static string TextOf(byte[] pdf)
    {
        using var document = PdfDocument.Open(pdf);
        return string.Join("\n", document.GetPages().Select(p => p.Text));
    }

    private async Task<ResumeSettingsDto> SaveContactAsync(string? phone, string? email, string? headline)
    {
        var result = await ResumeEndpoints.SaveContact(new ResumeContact(phone, email, headline), _db, default);
        return Assert.IsType<Ok<ResumeSettingsDto>>(result.Result).Value!;
    }

    private async Task<string> HeadlineAsync(HttpContext? http = null)
    {
        var result = await ResumeEndpoints.GetHeadline(_db, http ?? new DefaultHttpContext(), default);
        return result.Value!.Headline;
    }

    private async Task<ResumeSettingsDto> GenerateAsync(params string[] sections)
    {
        var result = await ResumeEndpoints.Generate(new ResumeChoices(sections, []), _db, LeetCode, Site, _time, default);
        return Assert.IsType<Ok<ResumeSettingsDto>>(result.Result).Value!;
    }

    [Fact]
    public async Task The_headline_is_empty_until_the_admin_sets_one()
    {
        Assert.Equal("", await HeadlineAsync());
    }

    [Fact]
    public async Task The_headline_is_public_trimmed_and_always_revalidated()
    {
        await SaveContactAsync(Phone, "me@example.com", "  Full-stack engineer · .NET, React  ");
        var http = new DefaultHttpContext();

        Assert.Equal("Full-stack engineer · .NET, React", await HeadlineAsync(http));
        Assert.Equal("no-cache", http.Response.Headers.CacheControl.ToString());
    }

    [Fact]
    public async Task A_new_headline_replaces_the_old_one_and_an_empty_one_clears_it()
    {
        await SaveContactAsync("", "", "Engineer");
        await SaveContactAsync("", "", "Senior engineer");
        Assert.Equal("Senior engineer", await HeadlineAsync());

        await SaveContactAsync("", "", null);
        Assert.Equal("", await HeadlineAsync());
    }

    [Fact]
    public async Task The_headline_only_carries_the_headline()
    {
        await SaveContactAsync(Phone, "me@example.com", "Engineer");

        var result = await ResumeEndpoints.GetHeadline(_db, new DefaultHttpContext(), default);

        // A record with one property: the phone and email can't reach visitors this way.
        Assert.Equal(["Headline"], result.Value!.GetType().GetProperties().Select(p => p.Name));
    }

    [Fact]
    public async Task The_settings_start_with_the_defaults_and_are_never_cached()
    {
        var http = new DefaultHttpContext();

        var settings = (await ResumeEndpoints.GetSettings(_db, http, default)).Value!;

        Assert.Equal(("", "", ""), (settings.Phone, settings.Email, settings.Headline));
        Assert.Equal(ResumeSections.Defaults, settings.Sections);
        Assert.Empty(settings.ExcludedSkills);
        Assert.Null(settings.GeneratedAt);
        Assert.Equal("private, no-store", http.Response.Headers.CacheControl.ToString());
    }

    [Fact]
    public async Task Saving_the_contact_trims_it_and_keeps_the_choices()
    {
        await ResumeEndpoints.SaveChoices(new ResumeChoices([ResumeSections.Skills], ["Cobol"]), _db, default);

        var saved = await SaveContactAsync($" {Phone} ", " me@example.com ", " Engineer ");

        Assert.Equal((Phone, "me@example.com", "Engineer"), (saved.Phone, saved.Email, saved.Headline));
        Assert.Equal([ResumeSections.Skills], saved.Sections);
        Assert.Equal(["Cobol"], saved.ExcludedSkills);
        var again = (await ResumeEndpoints.GetSettings(_db, new DefaultHttpContext(), default)).Value!;
        Assert.Equal((saved.Phone, saved.Email, saved.Headline), (again.Phone, again.Email, again.Headline));
    }

    [Fact]
    public async Task An_invalid_contact_changes_nothing()
    {
        await SaveContactAsync(Phone, "me@example.com", "Engineer");

        var result = await ResumeEndpoints.SaveContact(new ResumeContact("call me", "nope", new string('h', ResumeRules.HeadlineMaxLength + 1)), _db, default);

        Assert.Equal(["email", "headline", "phone"], Assert.IsType<ValidationProblem>(result.Result).ProblemDetails.Errors.Keys.Order());
        Assert.Equal("Engineer", await HeadlineAsync());
    }

    [Fact]
    public async Task Saving_the_choices_normalizes_them_and_keeps_the_contact()
    {
        await SaveContactAsync(Phone, "", "Engineer");

        var result = await ResumeEndpoints.SaveChoices(new ResumeChoices([ResumeSections.Places, ResumeSections.Experience, ResumeSections.Places], [" Cobol ", "cobol"]), _db, default);

        var saved = Assert.IsType<Ok<ResumeSettingsDto>>(result.Result).Value!;
        Assert.Equal([ResumeSections.Experience, ResumeSections.Places], saved.Sections);
        Assert.Equal(["Cobol"], saved.ExcludedSkills);
        Assert.Equal((Phone, "Engineer"), (saved.Phone, saved.Headline));
    }

    [Fact]
    public async Task Invalid_choices_are_rejected()
    {
        var result = await ResumeEndpoints.SaveChoices(new ResumeChoices(null, null), _db, default);
        var generate = await ResumeEndpoints.Generate(new ResumeChoices(["summary"], null), _db, LeetCode, Site, _time, default);

        Assert.Equal(["sections"], Assert.IsType<ValidationProblem>(result.Result).ProblemDetails.Errors.Keys);
        Assert.IsType<ValidationProblem>(generate.Result);
        Assert.Empty(_db.ResumeSettings);
    }

    [Fact]
    public async Task There_is_no_pdf_before_the_first_generation()
    {
        Assert.IsType<NotFound>((await ResumeEndpoints.GetPublicPdf(_db, new DefaultHttpContext(), default)).Result);
        Assert.IsType<NotFound>((await ResumeEndpoints.GetPrivatePdf(_db, new DefaultHttpContext(), default)).Result);

        // Saving the contact alone makes no PDF either.
        await SaveContactAsync(Phone, "", "");
        Assert.IsType<NotFound>((await ResumeEndpoints.GetPublicPdf(_db, new DefaultHttpContext(), default)).Result);
    }

    [Fact]
    public async Task Generating_makes_a_public_copy_without_the_phone_and_a_private_one_with_it()
    {
        await SaveContactAsync(Phone, "me@example.com", "Full-stack engineer");

        var settings = await GenerateAsync(ResumeSections.Experience);

        Assert.Equal(_time.GetUtcNow(), settings.GeneratedAt);
        var publicHttp = new DefaultHttpContext();
        var publicPdf = Assert.IsType<FileContentHttpResult>((await ResumeEndpoints.GetPublicPdf(_db, publicHttp, default)).Result);
        var privateHttp = new DefaultHttpContext();
        var privatePdf = Assert.IsType<FileContentHttpResult>((await ResumeEndpoints.GetPrivatePdf(_db, privateHttp, default, inline: true)).Result);

        Assert.Equal("application/pdf", publicPdf.ContentType);
        var publicText = TextOf(publicPdf.FileContents.ToArray());
        Assert.Contains("Full-stack engineer", publicText);
        Assert.Contains("me@example.com", publicText);
        Assert.DoesNotContain("7700", publicText);
        Assert.Contains("7700", TextOf(privatePdf.FileContents.ToArray()));
        Assert.Equal(_time.GetUtcNow(), publicPdf.LastModified);

        Assert.Equal("public, max-age=300", publicHttp.Response.Headers.CacheControl.ToString());
        Assert.Equal("private, no-store", privateHttp.Response.Headers.CacheControl.ToString());
        Assert.StartsWith("attachment", publicHttp.Response.Headers.ContentDisposition.ToString());
        Assert.StartsWith("inline", privateHttp.Response.Headers.ContentDisposition.ToString());
        Assert.Equal("nosniff", publicHttp.Response.Headers.XContentTypeOptions.ToString());
    }

    [Fact]
    public async Task Generating_points_the_page_download_link_at_the_new_copy()
    {
        var page = await AboutEndpoints.UpdateAbout(AboutDefaults.Content with { Links = AboutDefaults.Content.Links with { ResumeUrl = "/old.pdf" } }, _db, new Portfolio.Api.Features.Files.DatabaseFileStorage(_db, _time), _time, default);
        Assert.IsType<Ok<AboutContent>>(page.Result);
        _time.Advance(TimeSpan.FromMinutes(5));

        await GenerateAsync(ResumeSections.Experience);

        var about = await AboutEndpoints.LoadAsync(_db, default);
        Assert.Equal($"/api/resume?v={_time.GetUtcNow().ToUnixTimeSeconds()}", about.Links.ResumeUrl);
        // Nothing else on the page changes.
        Assert.Equal(AboutDefaults.Content.Experience.Select(e => e.Title), about.Experience.Select(e => e.Title));
        Assert.Equal(_time.GetUtcNow(), (await _db.AboutPages.SingleAsync()).UpdatedAt);
    }

    [Fact]
    public async Task Generating_before_the_page_is_saved_uses_the_placeholders_and_saves_the_link()
    {
        await GenerateAsync(ResumeSections.Experience);

        var about = await AboutEndpoints.LoadAsync(_db, default);
        Assert.StartsWith("/api/resume?v=", about.Links.ResumeUrl);
        Assert.Equal(AboutDefaults.Content.Experience.Select(e => e.Title), about.Experience.Select(e => e.Title));
    }

    [Fact]
    public async Task Generating_again_replaces_both_copies()
    {
        await SaveContactAsync(Phone, "", "First headline");
        await GenerateAsync(ResumeSections.Experience);
        _time.Advance(TimeSpan.FromDays(1));
        await SaveContactAsync(Phone, "", "Second headline");

        var settings = await GenerateAsync(ResumeSections.Experience);

        var text = TextOf(Assert.IsType<FileContentHttpResult>((await ResumeEndpoints.GetPublicPdf(_db, new DefaultHttpContext(), default)).Result).FileContents.ToArray());
        Assert.Contains("Second headline", text);
        Assert.DoesNotContain("First headline", text);
        Assert.Equal(_time.GetUtcNow(), settings.GeneratedAt);
    }

    [Fact]
    public async Task LeetCode_is_only_asked_when_problem_solving_is_printed_and_a_username_is_set()
    {
        await AboutEndpoints.UpdateAbout(AboutDefaults.Content with { ProblemSolving = new ProblemSolving("neetcode", []) }, _db, new Portfolio.Api.Features.Files.DatabaseFileStorage(_db, _time), _time, default);

        await GenerateAsync(ResumeSections.Experience);
        Assert.Equal(0, _leetCode.Calls);

        await GenerateAsync(ResumeSections.ProblemSolving);
        Assert.Equal(1, _leetCode.Calls);
        var text = TextOf(Assert.IsType<FileContentHttpResult>((await ResumeEndpoints.GetPublicPdf(_db, new DefaultHttpContext(), default)).Result).FileContents.ToArray());
        Assert.Contains("205 problems solved", text);
    }

    [Fact]
    public async Task A_resume_is_still_made_while_leetcode_is_down()
    {
        await AboutEndpoints.UpdateAbout(AboutDefaults.Content with { ProblemSolving = new ProblemSolving("neetcode", [NeetCodeListIds.Blind75]) }, _db, new Portfolio.Api.Features.Files.DatabaseFileStorage(_db, _time), _time, default);
        _leetCode.Fails = true;

        var settings = await GenerateAsync(ResumeSections.ProblemSolving);

        Assert.NotNull(settings.GeneratedAt);
        var text = TextOf(Assert.IsType<FileContentHttpResult>((await ResumeEndpoints.GetPublicPdf(_db, new DefaultHttpContext(), default)).Result).FileContents.ToArray());
        Assert.Contains("Blind 75", text);
        Assert.DoesNotContain("problems solved", text);
    }

    private sealed class FakeLeetCode : ILeetCodeClient
    {
        public int Calls;
        public bool Fails;

        public Task<LeetCodeStats?> FetchAsync(string username, CancellationToken cancellationToken)
        {
            Calls++;
            if (Fails) throw new HttpRequestException("LeetCode is down");
            return Task.FromResult<LeetCodeStats?>(new LeetCodeStats(username, new DifficultyCounts(205, 103, 98, 4), new DifficultyCounts(4000, 900, 2100, 1000), DateTimeOffset.UnixEpoch));
        }
    }
}
