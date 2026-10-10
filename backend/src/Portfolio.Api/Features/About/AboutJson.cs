using System.Text.Json;
using System.Text.Json.Nodes;

namespace Portfolio.Api.Features.About;

/// <summary>
/// Reads and writes the stored page. Reading also upgrades pages saved by older versions of the
/// API, so the shape can change without a data migration:
/// skills with a 0–100 level get no periods, qualifications that were plain text become a title
/// without a date, labels that were plain text get a flag guessed from their words, papers that were plain text become a title without a file, a company or institution website becomes a [name](url) link in the name, and
/// fields added later (statuses, colours, places, problem solving, languages, licences, hackathons) start empty.
/// </summary>
public static class AboutJson
{
    private static readonly JsonSerializerOptions Options = JsonSerializerOptions.Web;

    public static string Serialize(AboutContent content) => JsonSerializer.Serialize(content, Options);

    public static AboutContent Deserialize(string json)
    {
        var node = JsonNode.Parse(json)!.AsObject();

        if (node["skills"] is JsonArray skills)
        {
            foreach (var skill in skills.OfType<JsonObject>())
            {
                skill.Remove("level");
                skill["periods"] ??= new JsonArray();
            }
        }

        if (node["qualifications"] is JsonArray qualifications)
        {
            for (var i = 0; i < qualifications.Count; i++)
            {
                if (qualifications[i] is JsonValue text && text.TryGetValue<string>(out var title))
                {
                    qualifications[i] = new JsonObject { ["title"] = title, ["issuer"] = "", ["obtained"] = null, ["grade"] = "" };
                }
            }
        }

        if (node["papers"] is JsonArray papers)
        {
            for (var i = 0; i < papers.Count; i++)
            {
                if (papers[i] is JsonValue text && text.TryGetValue<string>(out var title)) papers[i] = new JsonObject { ["title"] = title, ["fileUrl"] = "" };
            }
        }

        if (node["statuses"] is JsonArray statuses)
        {
            for (var i = 0; i < statuses.Count; i++)
            {
                if (statuses[i] is JsonValue text && text.TryGetValue<string>(out var label)) statuses[i] = new JsonObject { ["text"] = label, ["flag"] = GuessFlag(label) };
            }
        }

        LinkNameToWebsite(node["experience"], "company", "companyUrl");
        LinkNameToWebsite(node["education"], "institution", "institutionUrl");

        var content = node.Deserialize<AboutContent>(Options)!;
        return content with
        {
            Colors = new AboutColors(
                WithDefaults(content.Colors?.Skills, AboutDefaults.Colors.Skills),
                WithDefaults(content.Colors?.Places, AboutDefaults.Colors.Places)),
            Statuses = [.. (content.Statuses ?? []).Select(s => s with { Flag = s.Flag ?? "" })],
            Places = content.Places ?? [],
            ProblemSolving = new ProblemSolving(content.ProblemSolving?.LeetCodeUsername ?? "", content.ProblemSolving?.NeetCodeLists ?? []),
            Papers = [.. (content.Papers ?? []).Select(p => p with { FileUrl = p.FileUrl ?? "" })],
            Languages = content.Languages ?? [],
            Licences = [.. (content.Licences ?? []).Select(l => l with { Code = l.Code ?? "" })],
            Hackathons = content.Hackathons ?? [],
            Experience = content.Experience ?? [],
            Education = content.Education ?? [],
            Qualifications = [.. (content.Qualifications ?? []).Select(q => q with { Issuer = q.Issuer ?? "", Grade = q.Grade ?? "" })],
        };
    }

    /// <summary>"Romanian citizenship" → "RO", "EU citizenship" → "EU", "UK Settled Status" → "GB"; otherwise no flag.</summary>
    public static string GuessFlag(string label)
    {
        var words = label.ToLowerInvariant().Split([' ', ',', '.', '(', ')', '-', '/'], StringSplitOptions.RemoveEmptyEntries);
        foreach (var (flag, names) in FlagWords)
        {
            if (words.Any(names.Contains)) return flag;
        }
        return "";
    }

    private static readonly (string Flag, string[] Words)[] FlagWords =
    [
        ("EU", ["eu", "european"]),
        ("GB", ["uk", "british", "britain", "england", "english"]),
        ("RO", ["romania", "romanian"]),
        ("DK", ["denmark", "danish"]),
        ("US", ["us", "usa", "american"]),
    ];

    /// <summary>"company": "Acme", "companyUrl": "https://acme.example" → "company": "[Acme](https://acme.example)".</summary>
    private static void LinkNameToWebsite(JsonNode? items, string nameKey, string urlKey)
    {
        if (items is not JsonArray array) return;
        foreach (var item in array.OfType<JsonObject>())
        {
            var url = item[urlKey]?.GetValue<string>()?.Trim();
            item.Remove(urlKey);
            var name = item[nameKey]?.GetValue<string>();
            if (string.IsNullOrEmpty(url) || !AboutRules.IsSafeUrl(url) || string.IsNullOrEmpty(name) || AboutRules.LinksIn(name).Any()) continue;
            item[nameKey] = $"[{name.Replace("[", "").Replace("]", "")}]({url})";
        }
    }

    private static IReadOnlyDictionary<string, string> WithDefaults(IReadOnlyDictionary<string, string>? colors, IReadOnlyDictionary<string, string> defaults) =>
        defaults.ToDictionary(d => d.Key, d => colors?.GetValueOrDefault(d.Key) ?? d.Value);
}
