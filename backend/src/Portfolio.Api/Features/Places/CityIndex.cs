using System.Globalization;
using System.IO.Compression;
using System.Text;

namespace Portfolio.Api.Features.Places;

/// <param name="Id">The GeoNames id.</param>
/// <param name="Region">State, county or similar; may be empty.</param>
public record City(long Id, string Name, string Region, string Country, double Latitude, double Longitude, int Population);

/// <summary>
/// Every place on Earth with 1,000+ people (~170k, from GeoNames), searchable by name. Loaded
/// into memory on the first search, from a file embedded in the API.
/// </summary>
public class CityIndex
{
    public const int MaxResults = 20;

    private readonly Lazy<Entry[]> _entries;

    public CityIndex() : this(OpenEmbedded) { }

    /// <param name="open">Returns the gzipped TSV built by scripts/build_cities.py.</param>
    public CityIndex(Func<Stream> open) => _entries = new Lazy<Entry[]>(() => Load(open));

    /// <summary>
    /// Places whose name starts with the query, largest first. Case and accents don't matter
    /// ("zurich" finds Zürich). Text after a comma narrows by region or country: "manchester, us".
    /// </summary>
    public IReadOnlyList<City> Search(string? query, int limit = 10)
    {
        var parts = (query ?? "").Split(',', 2);
        var name = Fold(parts[0]);
        var within = parts.Length > 1 ? Fold(parts[1]) : "";
        if (name.Length == 0) return [];
        limit = Math.Clamp(limit, 1, MaxResults);

        var results = new List<City>(limit);
        // Entries are stored largest first, so the first matches are the ones to show.
        foreach (var entry in _entries.Value)
        {
            if (!entry.Name.StartsWith(name, StringComparison.Ordinal) && !entry.AsciiName.StartsWith(name, StringComparison.Ordinal)) continue;
            if (within.Length > 0 && !entry.Within.Contains(within, StringComparison.Ordinal)) continue;
            results.Add(entry.City);
            if (results.Count == limit) break;
        }
        return results;
    }

    /// <summary>Lower case, without accents or extra spaces, for matching.</summary>
    public static string Fold(string text)
    {
        var decomposed = text.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var folded = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) folded.Append(c);
        }
        return string.Join(' ', folded.ToString().Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }

    private static Stream OpenEmbedded() =>
        typeof(CityIndex).Assembly.GetManifestResourceStream("cities.tsv.gz")
        ?? throw new InvalidOperationException("The embedded city list (cities.tsv.gz) is missing.");

    private static Entry[] Load(Func<Stream> open)
    {
        using var reader = new StreamReader(new GZipStream(open(), CompressionMode.Decompress), Encoding.UTF8);
        var entries = new List<Entry>(180_000);
        while (reader.ReadLine() is { } line)
        {
            if (line.Length == 0 || line[0] == '#') continue;
            // id, name, ascii name (empty when the same), region, country, latitude, longitude, population
            var c = line.Split('\t');
            var city = new City(
                long.Parse(c[0], CultureInfo.InvariantCulture),
                c[1],
                c[3],
                c[4],
                double.Parse(c[5], CultureInfo.InvariantCulture),
                double.Parse(c[6], CultureInfo.InvariantCulture),
                int.Parse(c[7], CultureInfo.InvariantCulture));
            entries.Add(new Entry(city, Fold(c[1]), Fold(c[2].Length > 0 ? c[2] : c[1]), Fold($"{c[3]} {c[4]}")));
        }
        return [.. entries];
    }

    private sealed record Entry(City City, string Name, string AsciiName, string Within);
}
