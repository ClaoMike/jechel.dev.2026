using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace RepoMap.DotNet;

internal static partial class Syntax
{
    /// <summary>
    /// Static text of a string expression: literals, constants, interpolations (unknown holes become
    /// {name}), and + concatenations. Null when the value is not static at all.
    /// </summary>
    public static string? StaticString(ExpressionSyntax? expression, SemanticModel? model, int depth = 0)
    {
        if (expression is null || depth > 6) return null;
        if (model is not null)
        {
            try
            {
                var constant = model.GetConstantValue(expression);
                if (constant.HasValue && constant.Value is string s) return s;
            }
            catch (ArgumentException)
            {
                // The expression belongs to another syntax tree than the model.
            }
        }
        switch (expression)
        {
            case LiteralExpressionSyntax literal when literal.IsKind(SyntaxKind.StringLiteralExpression):
                return literal.Token.ValueText;
            case InterpolatedStringExpressionSyntax interpolated:
            {
                var builder = new StringBuilder();
                foreach (var content in interpolated.Contents)
                {
                    if (content is InterpolatedStringTextSyntax text) builder.Append(text.TextToken.ValueText);
                    else if (content is InterpolationSyntax hole)
                        builder.Append(StaticString(hole.Expression, model, depth + 1) ?? $"{{{Placeholder(hole.Expression)}}}");
                }
                return builder.ToString();
            }
            case BinaryExpressionSyntax binary when binary.IsKind(SyntaxKind.AddExpression):
            {
                var left = StaticString(binary.Left, model, depth + 1);
                var right = StaticString(binary.Right, model, depth + 1);
                if (left is null && right is null) return null;
                return (left ?? $"{{{Placeholder(binary.Left)}}}") + (right ?? $"{{{Placeholder(binary.Right)}}}");
            }
            case ParenthesizedExpressionSyntax parenthesized:
                return StaticString(parenthesized.Expression, model, depth + 1);
        }
        return null;
    }

    private static string Placeholder(ExpressionSyntax expression)
    {
        var text = expression is IdentifierNameSyntax id ? id.Identifier.Text : "value";
        return PlaceholderRegex().Replace(text, "");
    }

    [GeneratedRegex(@"[^A-Za-z0-9_]")]
    private static partial Regex PlaceholderRegex();

    /// <summary>First sentence-ish of the XML doc &lt;summary&gt; with cref/paramref flattened to names.</summary>
    public static string? DocSummary(ISymbol? symbol)
    {
        if (symbol is null) return null;
        var xml = symbol.GetDocumentationCommentXml(expandIncludes: false);
        if (string.IsNullOrWhiteSpace(xml)) return null;
        try
        {
            var doc = XDocument.Parse(xml.Trim().StartsWith('<') ? $"<root>{xml}</root>" : xml);
            var summary = doc.Descendants("summary").FirstOrDefault();
            if (summary is null) return null;
            foreach (var see in summary.Descendants().Where(e => e.Name == "see" || e.Name == "seealso" || e.Name == "paramref" || e.Name == "typeparamref").ToList())
            {
                var reference = (string?)see.Attribute("cref") ?? (string?)see.Attribute("name") ?? (string?)see.Attribute("langword") ?? see.Value;
                see.ReplaceWith(ShortName(reference ?? ""));
            }
            var text = Regex.Replace(summary.Value, @"\s+", " ").Trim();
            return text.Length == 0 ? null : text.Length > 400 ? text[..400] : text;
        }
        catch (System.Xml.XmlException)
        {
            return null;
        }
    }

    private static string ShortName(string cref)
    {
        var name = cref.Contains(':') ? cref[(cref.IndexOf(':') + 1)..] : cref;
        name = name.Split('(')[0];
        return name.Split('.').Last();
    }

    /// <summary>CLR-style full name: Namespace.Outer+Inner`1 (matches EF Core snapshot entity names).</summary>
    public static string FullName(INamedTypeSymbol type)
    {
        var parts = new Stack<string>();
        ISymbol current = type;
        while (current is INamedTypeSymbol named)
        {
            parts.Push(named.MetadataName);
            current = named.ContainingType is { } containing ? containing : named.ContainingNamespace;
            if (current is INamedTypeSymbol) parts.Push("+");
        }
        var ns = type.ContainingNamespace is { IsGlobalNamespace: false } n ? n.ToDisplayString() + "." : "";
        return ns + string.Concat(parts);
    }

    public static string DisplayName(INamedTypeSymbol type)
    {
        var name = type.Name;
        if (type.IsGenericType) name += "<" + string.Join(", ", type.TypeParameters.Select(p => p.Name)) + ">";
        return type.ContainingType is { } outer ? $"{DisplayName(outer)}.{name}" : name;
    }

    public static bool InheritsFrom(ITypeSymbol? type, string metadataName)
    {
        for (var current = type?.BaseType; current is not null; current = current.BaseType)
        {
            if (current.Name == metadataName || current.MetadataName == metadataName) return true;
        }
        return false;
    }

    public static bool Implements(ITypeSymbol type, string interfaceName) =>
        type.AllInterfaces.Any(i => i.Name == interfaceName);

    /// <summary>Unwraps Task&lt;T&gt;, IOptions&lt;T&gt;, Results&lt;Ok&lt;T&gt;,…&gt;, List&lt;T&gt;, T[]… into the interesting types.</summary>
    public static IEnumerable<INamedTypeSymbol> Unwrap(ITypeSymbol? type, int depth = 0)
    {
        if (type is null || depth > 6) yield break;
        if (type is IArrayTypeSymbol array)
        {
            foreach (var inner in Unwrap(array.ElementType, depth + 1)) yield return inner;
            yield break;
        }
        if (type is not INamedTypeSymbol named) yield break;
        if (named.IsGenericType)
        {
            if (!Wrappers.Contains(named.Name)) yield return named.OriginalDefinition;
            foreach (var argument in named.TypeArguments)
                foreach (var inner in Unwrap(argument, depth + 1)) yield return inner;
        }
        else
        {
            yield return named;
        }
    }

    private static readonly HashSet<string> Wrappers =
    [
        "Task", "ValueTask", "IOptions", "IOptionsMonitor", "IOptionsSnapshot", "ILogger", "Lazy", "Func", "Nullable",
        "IEnumerable", "ICollection", "IList", "List", "IReadOnlyList", "IReadOnlyCollection", "IAsyncEnumerable", "HashSet",
        "Results", "Ok", "Created", "CreatedAtRoute", "Accepted", "AcceptedAtRoute", "JsonHttpResult", "ActionResult",
        "IQueryable", "DbSet", "IValidator", "IDbContextFactory", "IServiceScopeFactory", "Dictionary", "IDictionary",
        "KeyValuePair", "IReadOnlyDictionary",
    ];

    public static string JoinRoute(params string?[] parts)
    {
        var segments = parts
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => p!.Trim().Trim('/'))
            .Where(p => p.Length > 0);
        return "/" + string.Join('/', segments);
    }

    public static string? FeatureOf(string path)
    {
        var parts = path.Split('/');
        for (var i = 0; i < parts.Length - 2; i++)
        {
            if (parts[i].Equals("Features", StringComparison.OrdinalIgnoreCase) || parts[i].Equals("Modules", StringComparison.OrdinalIgnoreCase))
                return parts[i + 1].ToLowerInvariant();
        }
        return null;
    }

    public static Evidence Evidence(string file, SyntaxNode node) =>
        new() { File = file, Line = node.GetLocation().GetLineSpan().StartLinePosition.Line + 1 };

    public static int Line(SyntaxNode node) => node.GetLocation().GetLineSpan().StartLinePosition.Line + 1;

    public static int EndLine(SyntaxNode node) => node.GetLocation().GetLineSpan().EndLinePosition.Line + 1;

    public static string MethodName(InvocationExpressionSyntax invocation) => invocation.Expression switch
    {
        MemberAccessExpressionSyntax member => member.Name.Identifier.Text,
        MemberBindingExpressionSyntax binding => binding.Name.Identifier.Text,
        SimpleNameSyntax simple => simple.Identifier.Text,
        _ => "",
    };

    public static ExpressionSyntax? Receiver(InvocationExpressionSyntax invocation) =>
        invocation.Expression is MemberAccessExpressionSyntax member ? member.Expression : null;
}
