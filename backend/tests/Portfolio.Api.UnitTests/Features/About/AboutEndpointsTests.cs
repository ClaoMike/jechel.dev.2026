using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.About;
using Portfolio.Api.Features.Files;

namespace Portfolio.Api.UnitTests.Features.About;

public class AboutEndpointsTests
{
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 8, 12, 0, 0, TimeSpan.Zero));
    private readonly PortfolioDbContext _db = new(new DbContextOptionsBuilder<PortfolioDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    private DatabaseFileStorage Files => new(_db, _time);

    private static readonly Skill Rust = new("Rust", [new SkillPeriod(new DateOnly(2024, 1, 1), null, [SkillUses.Personal])]);

    [Fact]
    public async Task GetAbout_returns_the_placeholders_before_the_first_save()
    {
        var result = await AboutEndpoints.GetAbout(_db, CancellationToken.None);

        Assert.Same(AboutDefaults.Content, result.Value);
    }

    [Fact]
    public async Task UpdateAbout_stores_the_normalized_page_and_GetAbout_returns_it()
    {
        var content = AboutDefaults.Content with { PhotoUrl = " /me.jpg ", Skills = [Rust] };

        var saved = await AboutEndpoints.UpdateAbout(content, _db, Files, _time, CancellationToken.None);

        var ok = Assert.IsType<Ok<AboutContent>>(saved.Result);
        Assert.Equal("/me.jpg", ok.Value!.PhotoUrl);
        var loaded = (await AboutEndpoints.GetAbout(_db, CancellationToken.None)).Value!;
        Assert.Equal("/me.jpg", loaded.PhotoUrl);
        Assert.Equal("Rust", Assert.Single(loaded.Skills).Name);
        var period = Assert.Single(loaded.Skills[0].Periods);
        Assert.Equal((new DateOnly(2024, 1, 1), (DateOnly?)null), (period.Start, period.End));
        Assert.Equal([SkillUses.Personal], period.Uses);
        Assert.Equal(AboutDefaults.Content.Experience.Select(e => e.Title), loaded.Experience.Select(e => e.Title));
        Assert.Equal(_time.GetUtcNow(), (await _db.AboutPages.SingleAsync()).UpdatedAt);
    }

    [Fact]
    public async Task UpdateAbout_replaces_the_previous_version()
    {
        await AboutEndpoints.UpdateAbout(AboutDefaults.Content, _db, Files, _time, CancellationToken.None);

        await AboutEndpoints.UpdateAbout(AboutDefaults.Content with { Papers = [] }, _db, Files, _time, CancellationToken.None);

        Assert.Single(_db.AboutPages);
        Assert.Empty((await AboutEndpoints.GetAbout(_db, CancellationToken.None)).Value!.Papers);
    }

    [Fact]
    public async Task UpdateAbout_rejects_invalid_content_and_keeps_the_old_page()
    {
        var invalid = AboutDefaults.Content with { Links = AboutDefaults.Content.Links with { ResumeUrl = "javascript:alert(1)" } };

        var result = await AboutEndpoints.UpdateAbout(invalid, _db, Files, _time, CancellationToken.None);

        var problem = Assert.IsType<ValidationProblem>(result.Result);
        Assert.Equal(["links.resumeUrl"], problem.ProblemDetails.Errors.Keys);
        Assert.Empty(_db.AboutPages);
    }

    [Fact]
    public async Task UpdateAbout_deletes_uploads_the_page_no_longer_uses_once_they_are_a_day_old()
    {
        var oldPhoto = await Files.SaveAsync("photo.webp", "image/webp", [1], CancellationToken.None);
        var resume = await Files.SaveAsync("CV.pdf", "application/pdf", [2], CancellationToken.None);
        _time.Advance(TimeSpan.FromDays(2));
        var justUploaded = await Files.SaveAsync("photo.webp", "image/webp", [3], CancellationToken.None);
        var content = AboutDefaults.Content with
        {
            PhotoUrl = FileRules.UrlFor(justUploaded, "photo.webp"),
            Links = AboutDefaults.Content.Links with { ResumeUrl = FileRules.UrlFor(resume, "CV.pdf") },
        };

        await AboutEndpoints.UpdateAbout(content, _db, Files, _time, CancellationToken.None);

        Assert.Null(await Files.GetAsync(oldPhoto, CancellationToken.None));
        Assert.NotNull(await Files.GetAsync(resume, CancellationToken.None));
        Assert.NotNull(await Files.GetAsync(justUploaded, CancellationToken.None));
    }

    [Fact]
    public async Task GetAbout_upgrades_a_page_saved_in_the_old_shape()
    {
        _db.AboutPages.Add(new AboutPage { Id = AboutPage.SingletonId, Content = """{"photoUrl":"","links":{"resumeUrl":"","gitHubUrl":"","linkedInUrl":"","instagramUrl":""},"skills":[{"name":"C#","level":90}],"experience":[],"education":[],"papers":[],"qualifications":["Cert"]}""" });
        await _db.SaveChangesAsync();

        var page = (await AboutEndpoints.GetAbout(_db, CancellationToken.None)).Value!;

        Assert.Empty(page.Skills[0].Periods);
        Assert.Equal("Cert", page.Qualifications[0].Title);
    }
}
