using System.Text.Json;
using System.Text.Json.Nodes;

namespace Portfolio.Api.Features.About;

/// <summary>
/// Reads and writes the stored page. Reading also upgrades pages saved by older versions of the
/// API, so the shape can change without a data migration:
/// skills with a 0–100 level get no periods, qualifications that were plain text become a title
/// without a date, and fields added later (colours, places, website links) get their defaults.
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

        var content = node.Deserialize<AboutContent>(Options)!;
        return content with
        {
            Colors = new AboutColors(
                WithDefaults(content.Colors?.Skills, AboutDefaults.Colors.Skills),
                WithDefaults(content.Colors?.Places, AboutDefaults.Colors.Places)),
            Places = content.Places ?? [],
            Experience = [.. (content.Experience ?? []).Select(e => e with { CompanyUrl = e.CompanyUrl ?? "" })],
            Education = [.. (content.Education ?? []).Select(e => e with { InstitutionUrl = e.InstitutionUrl ?? "" })],
            Qualifications = [.. (content.Qualifications ?? []).Select(q => q with { Issuer = q.Issuer ?? "", Grade = q.Grade ?? "" })],
        };
    }

    private static IReadOnlyDictionary<string, string> WithDefaults(IReadOnlyDictionary<string, string>? colors, IReadOnlyDictionary<string, string> defaults) =>
        defaults.ToDictionary(d => d.Key, d => colors?.GetValueOrDefault(d.Key) ?? d.Value);
}
