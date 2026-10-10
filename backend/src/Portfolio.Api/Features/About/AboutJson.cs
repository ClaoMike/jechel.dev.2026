using System.Text.Json;
using System.Text.Json.Nodes;

namespace Portfolio.Api.Features.About;

/// <summary>
/// Reads and writes the stored page. Reading also upgrades pages saved by older versions of the
/// API, so the shape can change without a data migration:
/// skills with a 0–100 level get no periods, qualifications that were plain text become a title
/// without a date, a company or institution website becomes a [name](url) link in the name, and
/// fields added later (colours, places) get their defaults.
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

        LinkNameToWebsite(node["experience"], "company", "companyUrl");
        LinkNameToWebsite(node["education"], "institution", "institutionUrl");

        var content = node.Deserialize<AboutContent>(Options)!;
        return content with
        {
            Colors = new AboutColors(
                WithDefaults(content.Colors?.Skills, AboutDefaults.Colors.Skills),
                WithDefaults(content.Colors?.Places, AboutDefaults.Colors.Places)),
            Places = content.Places ?? [],
            Experience = content.Experience ?? [],
            Education = content.Education ?? [],
            Qualifications = [.. (content.Qualifications ?? []).Select(q => q with { Issuer = q.Issuer ?? "", Grade = q.Grade ?? "" })],
        };
    }

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
