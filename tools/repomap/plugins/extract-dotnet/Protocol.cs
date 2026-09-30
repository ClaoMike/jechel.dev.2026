using System.Text.Json;
using System.Text.Json.Serialization;

namespace RepoMap.DotNet;

// The repomap plugin protocol (see /schema/plugin-output.schema.json).

public static class Json
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNameCaseInsensitive = true,
    };
}

public sealed class PluginRequest
{
    public int Protocol { get; set; }
    public string RepoRoot { get; set; } = "";
    public PluginInfo Plugin { get; set; } = new();
    public List<FileEntry> Files { get; set; } = [];
    public List<string> Claimed { get; set; } = [];
}

public sealed class PluginInfo
{
    public string Id { get; set; } = "";
    public string Kind { get; set; } = "";
    public Dictionary<string, JsonElement>? Options { get; set; }

    public string? Option(string name) =>
        Options is not null && Options.TryGetValue(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}

public sealed class FileEntry
{
    public string Path { get; set; } = "";
    public string Layer { get; set; } = "";
    public string Role { get; set; } = "";
    public string RoleReason { get; set; } = "";
}

public sealed class OutNode
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "";
    public string Kind { get; set; } = "";
    public string? Layer { get; set; }
    public string? Role { get; set; }
    public string? RoleReason { get; set; }
    public string? Parent { get; set; }
    public string? File { get; set; }
    public int? Line { get; set; }
    public int? EndLine { get; set; }
    public List<string>? Tags { get; set; }
    public Dictionary<string, object?>? Attrs { get; set; }
    public string? Description { get; set; }
    public string? DescriptionSource { get; set; }
}

public sealed class Evidence
{
    public string File { get; set; } = "";
    public int? Line { get; set; }
}

public sealed class OutEdge
{
    public string From { get; set; } = "";
    public string To { get; set; } = "";
    public string Type { get; set; } = "";
    public double? Confidence { get; set; }
    public List<Evidence>? Evidence { get; set; }
    public Dictionary<string, object?>? Attrs { get; set; }
}

public sealed class Fact
{
    public string Type { get; set; } = "";
    public string From { get; set; } = "";
    public string EdgeType { get; set; } = "";
    public string? Method { get; set; }
    public string? Url { get; set; }
    public string? Path { get; set; }
    public double? Confidence { get; set; }
    public List<Evidence>? Evidence { get; set; }
    public Dictionary<string, object?>? Attrs { get; set; }
}

public sealed class Diagnostic
{
    public string Level { get; set; } = "info";
    public string Message { get; set; } = "";
    public string? File { get; set; }
    public int? Line { get; set; }
}

public sealed class PluginOutput
{
    public int Protocol { get; set; } = 1;
    public List<OutNode> Nodes { get; set; } = [];
    public List<OutEdge> Edges { get; set; } = [];
    public List<Fact> Facts { get; set; } = [];
    public List<string> Claims { get; set; } = [];
    public List<Diagnostic> Diagnostics { get; set; } = [];
}

/// <summary>Collects nodes/edges with de-duplication (edges are unique per from/type/to).</summary>
public sealed class OutputBuilder
{
    private readonly Dictionary<string, OutNode> _nodes = new(StringComparer.Ordinal);
    private readonly Dictionary<string, OutEdge> _edges = new(StringComparer.Ordinal);
    public readonly List<Fact> Facts = [];
    public readonly SortedSet<string> Claims = new(StringComparer.Ordinal);
    public readonly List<Diagnostic> Diagnostics = [];

    public bool HasNode(string id) => _nodes.ContainsKey(id);
    public OutNode? GetNode(string id) => _nodes.GetValueOrDefault(id);

    public OutNode AddNode(OutNode node)
    {
        if (_nodes.TryGetValue(node.Id, out var existing)) return existing;
        _nodes[node.Id] = node;
        return node;
    }

    public void AddEdge(string from, string to, string type, Evidence? evidence = null, double confidence = 1, Dictionary<string, object?>? attrs = null)
    {
        if (from == to) return;
        var key = $"{from}|{type}|{to}";
        if (_edges.TryGetValue(key, out var existing))
        {
            if (evidence is not null && (existing.Evidence?.Count ?? 0) < 3 && existing.Evidence?.Any(e => e.File == evidence.File && e.Line == evidence.Line) != true)
                (existing.Evidence ??= []).Add(evidence);
            if (confidence > (existing.Confidence ?? 1)) existing.Confidence = confidence;
            return;
        }
        _edges[key] = new OutEdge
        {
            From = from,
            To = to,
            Type = type,
            Confidence = confidence >= 1 ? null : Math.Round(confidence, 2),
            Evidence = evidence is null ? null : [evidence],
            Attrs = attrs,
        };
    }

    public IEnumerable<OutEdge> Edges => _edges.Values;

    /// <summary>A generic "uses" edge adds nothing when a more specific edge links the same pair.</summary>
    public void DropRedundantUses()
    {
        var specific = _edges.Values
            .Where(e => e.Type is not "uses" and not "uses-type" and not "contains")
            .Select(e => $"{e.From}|{e.To}")
            .ToHashSet(StringComparer.Ordinal);
        foreach (var key in _edges.Where(kv => kv.Value.Type is "uses" or "uses-type" && specific.Contains($"{kv.Value.From}|{kv.Value.To}")).Select(kv => kv.Key).ToList())
            _edges.Remove(key);
    }

    public PluginOutput Build() => new()
    {
        Nodes = [.. _nodes.Values.OrderBy(n => n.Id, StringComparer.Ordinal)],
        Edges = [.. _edges.Values.OrderBy(e => $"{e.From}|{e.Type}|{e.To}", StringComparer.Ordinal)],
        Facts = Facts,
        Claims = [.. Claims],
        Diagnostics = Diagnostics,
    };
}
