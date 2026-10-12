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
    public async Task GetTerms_returns_the_defaults_without_a_date_before_the_first_save()
    {
        var terms = (await TermsEndpoints.GetTerms(_db, CancellationToken.None)).Value!;

        Assert.Equal(TermsDefaults.Content.Title, terms.Title);
        Assert.Equal(TermsDefaults.Content.Sections.Count, terms.Sections.Count);
        Assert.Null(terms.UpdatedAt);
    }

    [Fact]
    public async Task UpdateTerms_stores_the_normalized_terms_with_the_date_and_GetTerms_returns_them()
    {
        var content = new TermsContent(" House rules ", "", [new TermsSection("Be nice", [new TermsBlock(TermsBlockKinds.Bullets, "", ["No spam", " "])])]);

        var saved = await TermsEndpoints.UpdateTerms(content, _db, _time, CancellationToken.None);

        var ok = Assert.IsType<Ok<TermsDocument>>(saved.Result);
        Assert.Equal(("House rules", _time.GetUtcNow()), (ok.Value!.Title, ok.Value.UpdatedAt));
        var loaded = (await TermsEndpoints.GetTerms(_db, CancellationToken.None)).Value!;
        Assert.Equal("House rules", loaded.Title);
        Assert.Equal(["No spam"], Assert.Single(Assert.Single(loaded.Sections).Blocks).Items);
        Assert.Equal(_time.GetUtcNow(), loaded.UpdatedAt);
    }

    [Fact]
    public async Task UpdateTerms_replaces_the_previous_version_and_moves_the_date()
    {
        await TermsEndpoints.UpdateTerms(TermsDefaults.Content, _db, _time, CancellationToken.None);
        _time.Advance(TimeSpan.FromDays(1));

        await TermsEndpoints.UpdateTerms(TermsDefaults.Content with { Sections = [] }, _db, _time, CancellationToken.None);

        Assert.Single(_db.TermsPages);
        var loaded = (await TermsEndpoints.GetTerms(_db, CancellationToken.None)).Value!;
        Assert.Empty(loaded.Sections);
        Assert.Equal(_time.GetUtcNow(), loaded.UpdatedAt);
    }

    [Fact]
    public async Task UpdateTerms_rejects_invalid_terms_and_keeps_the_old_ones()
    {
        var result = await TermsEndpoints.UpdateTerms(TermsDefaults.Content with { Title = "" }, _db, _time, CancellationToken.None);

        var problem = Assert.IsType<ValidationProblem>(result.Result);
        Assert.Equal(["title"], problem.ProblemDetails.Errors.Keys);
        Assert.Empty(_db.TermsPages);
    }
}
