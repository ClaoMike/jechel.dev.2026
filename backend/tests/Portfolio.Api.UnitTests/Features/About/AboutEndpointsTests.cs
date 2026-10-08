using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Portfolio.Api.Data;
using Portfolio.Api.Features.About;

namespace Portfolio.Api.UnitTests.Features.About;

public class AboutEndpointsTests
{
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 8, 12, 0, 0, TimeSpan.Zero));
    private readonly PortfolioDbContext _db = new(new DbContextOptionsBuilder<PortfolioDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options);

    [Fact]
    public async Task GetAbout_returns_the_placeholders_before_the_first_save()
    {
        var result = await AboutEndpoints.GetAbout(_db, CancellationToken.None);

        Assert.Same(AboutDefaults.Content, result.Value);
    }

    [Fact]
    public async Task UpdateAbout_stores_the_normalized_page_and_GetAbout_returns_it()
    {
        var content = AboutDefaults.Content with { PhotoUrl = " /me.jpg ", Skills = [new Skill("Rust", 40)] };

        var saved = await AboutEndpoints.UpdateAbout(content, _db, _time, CancellationToken.None);

        var ok = Assert.IsType<Ok<AboutContent>>(saved.Result);
        Assert.Equal("/me.jpg", ok.Value!.PhotoUrl);
        var loaded = (await AboutEndpoints.GetAbout(_db, CancellationToken.None)).Value!;
        Assert.Equal("/me.jpg", loaded.PhotoUrl);
        Assert.Equal([new Skill("Rust", 40)], loaded.Skills);
        Assert.Equal(AboutDefaults.Content.Experience.Select(e => e.Title), loaded.Experience.Select(e => e.Title));
        Assert.Equal(_time.GetUtcNow(), (await _db.AboutPages.SingleAsync()).UpdatedAt);
    }

    [Fact]
    public async Task UpdateAbout_replaces_the_previous_version()
    {
        await AboutEndpoints.UpdateAbout(AboutDefaults.Content, _db, _time, CancellationToken.None);

        await AboutEndpoints.UpdateAbout(AboutDefaults.Content with { Papers = [] }, _db, _time, CancellationToken.None);

        Assert.Single(_db.AboutPages);
        Assert.Empty((await AboutEndpoints.GetAbout(_db, CancellationToken.None)).Value!.Papers);
    }

    [Fact]
    public async Task UpdateAbout_rejects_invalid_content_and_keeps_the_old_page()
    {
        var invalid = AboutDefaults.Content with { Links = AboutDefaults.Content.Links with { ResumeUrl = "javascript:alert(1)" } };

        var result = await AboutEndpoints.UpdateAbout(invalid, _db, _time, CancellationToken.None);

        var problem = Assert.IsType<ValidationProblem>(result.Result);
        Assert.Equal(["links.resumeUrl"], problem.ProblemDetails.Errors.Keys);
        Assert.Empty(_db.AboutPages);
    }
}
