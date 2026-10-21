using System.IO.Compression;
using System.Text;
using Portfolio.Api.Features.Places;

namespace Portfolio.Api.UnitTests.Features.Places;

public class CityIndexTests
{
    // Same format as scripts/build_cities.py writes: largest first.
    private const string Tsv = """
        # header comment
        2643123	Manchester		England	United Kingdom	53.481	-2.237	568996
        5089178	Manchester		New Hampshire	United States	42.996	-71.455	110229
        2657896	Zürich	Zurich	Zurich	Switzerland	47.367	8.550	341730
        683506	Bucharest		Bucureşti	Romania	44.432	26.106	1877155
        2643097	Manchester Village		England	United Kingdom	53.000	-2.000	1200
        """;

    private static CityIndex Index() => new(() =>
    {
        var buffer = new MemoryStream();
        using (var gzip = new GZipStream(buffer, CompressionLevel.Fastest, leaveOpen: true))
        {
            gzip.Write(Encoding.UTF8.GetBytes(Tsv.Replace("\r\n", "\n")));
        }
        buffer.Position = 0;
        return buffer;
    });

    [Fact]
    public void Finds_places_by_the_start_of_their_name_in_file_order()
    {
        var results = Index().Search("manch");

        Assert.Equal([2643123, 5089178, 2643097], results.Select(c => c.Id));
        Assert.Equal(new City(2643123, "Manchester", "England", "United Kingdom", 53.481, -2.237, 568996), results[0]);
    }

    [Theory]
    [InlineData("zurich")]
    [InlineData("ZÜRICH")]
    [InlineData("  zur ")]
    public void Ignores_case_accents_and_spaces(string query)
    {
        Assert.Equal("Zürich", Assert.Single(Index().Search(query)).Name);
    }

    [Fact]
    public void Text_after_a_comma_narrows_by_region_or_country()
    {
        Assert.Equal([5089178], Index().Search("manchester, new hamp").Select(c => c.Id));
        Assert.Equal([2643123, 2643097], Index().Search("manchester, united kingdom").Select(c => c.Id));
    }

    [Fact]
    public void Returns_at_most_the_limit()
    {
        Assert.Single(Index().Search("manchester", limit: 1));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    [InlineData("nowhere")]
    public void Finds_nothing_for_an_empty_or_unknown_name(string? query)
    {
        Assert.Empty(Index().Search(query));
    }

    [Fact]
    public void The_embedded_list_has_the_big_cities()
    {
        var london = new CityIndex().Search("london, united kingdom")[0];

        Assert.Equal(("London", "England"), (london.Name, london.Region));
        Assert.InRange(london.Latitude, 51, 52);
    }
}
