using System.Diagnostics;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.MSBuild;

namespace RepoMap.DotNet;

/// <summary>
/// Semantic analysis of C# projects with Roslyn (MSBuildWorkspace; falls back to an ad-hoc compilation).
///
/// Nodes: every named type (classified as endpoint group, service, DbContext, entity, options, DTO, setup,
/// middleware, controller, test suite/helper…), entity properties, and every HTTP endpoint with its full
/// route (MapGroup prefixes are followed through extension methods).
/// Edges: DI (injects/registers/resolves), queries/reads/writes on entities, calls, returns, tests.
/// Facts: HTTP requests made by tests, redirects (navigation), for the linkers to resolve.
/// </summary>
public sealed class CodeExtractor
{
    private sealed record DocInfo(SyntaxTree Tree, SemanticModel Model, FileEntry File, bool IsTestProject, string ProjectDir);

    private sealed class TypeNode
    {
        public required string Id;
        public required INamedTypeSymbol Symbol;
        public required DocInfo Doc;
        public required SyntaxNode Declaration;
        public string Kind = "class";
        public string? Role;
        public string? RoleReason;
        public readonly Dictionary<string, object?> Attrs = [];
    }

    private sealed class EndpointInfo
    {
        public required string Id;
        public required string Method;
        public required string Route;
        public required DocInfo Doc;
        public required SyntaxNode MappedAt;
        public INamedTypeSymbol? OwnerType;
        public IMethodSymbol? HandlerMethod;
        public SyntaxNode? HandlerLambda;
        public string? Name;
        public string? Auth;
        public List<string> Tags = [];
        public string? Summary;
        public string? Special;
        public Dictionary<string, object?> Extra = [];
    }

    private sealed record RouteScope(string Prefix, string? Auth, IReadOnlyList<string> Tags)
    {
        public static readonly RouteScope Root = new("", null, []);
    }

    private static readonly Dictionary<string, string> MapVerbs = new()
    {
        ["MapGet"] = "GET", ["MapPost"] = "POST", ["MapPut"] = "PUT", ["MapDelete"] = "DELETE", ["MapPatch"] = "PATCH",
        ["MapMethods"] = "*", ["Map"] = "ANY", ["MapHealthChecks"] = "ANY", ["MapOpenApi"] = "GET", ["MapHub"] = "ANY",
        ["MapFallback"] = "ANY", ["MapFallbackToFile"] = "GET",
    };

    private static readonly HashSet<string> GroupModifiers =
    [
        "RequireAuthorization", "AllowAnonymous", "WithTags", "WithOpenApi", "WithGroupName", "AddEndpointFilter",
        "RequireCors", "DisableAntiforgery", "RequireRateLimiting", "WithMetadata", "ProducesProblem", "CacheOutput",
    ];

    private static readonly Dictionary<string, string> DiMethods = new()
    {
        ["AddScoped"] = "scoped", ["TryAddScoped"] = "scoped", ["AddKeyedScoped"] = "scoped",
        ["AddTransient"] = "transient", ["TryAddTransient"] = "transient", ["AddKeyedTransient"] = "transient",
        ["AddSingleton"] = "singleton", ["TryAddSingleton"] = "singleton", ["AddKeyedSingleton"] = "singleton",
        ["AddHostedService"] = "hosted", ["AddDbContext"] = "scoped", ["AddDbContextFactory"] = "singleton",
        ["AddDbContextPool"] = "scoped", ["AddHttpClient"] = "transient", ["Configure"] = "options", ["AddOptions"] = "options",
    };

    private static readonly HashSet<string> ResolveMethods =
        ["GetRequiredService", "GetService", "GetRequiredKeyedService", "GetKeyedService", "GetServices"];

    private static readonly HashSet<string> TestAttributes =
        ["Fact", "Theory", "Test", "TestCase", "TestCaseSource", "TestMethod", "DataTestMethod", "SkippableFact", "SkippableTheory"];

    private static readonly Dictionary<string, string> HttpClientMethods = new()
    {
        ["GetAsync"] = "GET", ["GetStringAsync"] = "GET", ["GetByteArrayAsync"] = "GET", ["GetStreamAsync"] = "GET",
        ["GetFromJsonAsync"] = "GET", ["PostAsync"] = "POST", ["PostAsJsonAsync"] = "POST", ["PutAsync"] = "PUT",
        ["PutAsJsonAsync"] = "PUT", ["PatchAsync"] = "PATCH", ["PatchAsJsonAsync"] = "PATCH", ["DeleteAsync"] = "DELETE",
        ["DeleteFromJsonAsync"] = "DELETE",
    };

    private readonly PluginRequest _request;
    private readonly Dictionary<string, FileEntry> _files;
    private readonly OutputBuilder _out = new();
    private readonly Stopwatch _clock = Stopwatch.StartNew();

    private readonly List<DocInfo> _docs = [];
    private readonly Dictionary<SyntaxTree, DocInfo> _docByTree = [];
    private readonly Dictionary<INamedTypeSymbol, TypeNode> _types = new(SymbolEqualityComparer.Default);
    private readonly HashSet<INamedTypeSymbol> _efTypes = new(SymbolEqualityComparer.Default);
    private readonly Dictionary<IMethodSymbol, List<string>> _handlerMethods = new(SymbolEqualityComparer.Default);
    private readonly Dictionary<SyntaxNode, List<string>> _handlerLambdas = [];
    private readonly HashSet<SyntaxNode> _handlerArguments = [];
    private readonly HashSet<SyntaxNode> _processedMaps = [];
    private readonly HashSet<INamedTypeSymbol> _entities = new(SymbolEqualityComparer.Default);
    private readonly Dictionary<IPropertySymbol, string> _entityProperties = new(SymbolEqualityComparer.Default);
    private readonly HashSet<INamedTypeSymbol> _dbContexts = new(SymbolEqualityComparer.Default);
    private readonly HashSet<INamedTypeSymbol> _endpointOwners = new(SymbolEqualityComparer.Default);
    private readonly Dictionary<INamedTypeSymbol, string> _registered = new(SymbolEqualityComparer.Default);
    private readonly HashSet<INamedTypeSymbol> _injected = new(SymbolEqualityComparer.Default);
    private readonly HashSet<INamedTypeSymbol> _returned = new(SymbolEqualityComparer.Default);
    private readonly HashSet<INamedTypeSymbol> _optionsBound = new(SymbolEqualityComparer.Default);
    private readonly Dictionary<string, EndpointInfo> _endpoints = new(StringComparer.Ordinal);
    private readonly Dictionary<SyntaxNode, List<string>> _ownerCache = [];
    private readonly List<(string Key, List<string> Owners, DocInfo Doc, SyntaxNode At)> _configUses = [];
    private INamedTypeSymbol? _programType;
    private MSBuildWorkspace? _workspace;

    private CodeExtractor(PluginRequest request)
    {
        _request = request;
        _files = request.Files.ToDictionary(f => f.Path, StringComparer.Ordinal);
    }

    public static async Task<PluginOutput> RunAsync(PluginRequest request)
    {
        var extractor = new CodeExtractor(request);
        try
        {
            await extractor.LoadAsync();
            extractor.Analyze();
        }
        finally
        {
            extractor._workspace?.Dispose();
        }
        return extractor._out.Build();
    }

    private static void Log(string message) => Console.Error.WriteLine($"dotnet: {message}");

    // ------------------------------------------------------------------ loading

    private async Task LoadAsync()
    {
        var projects = _files.Keys.Where(p => p.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase)).Order(StringComparer.Ordinal).ToList();
        var loaded = false;
        if (projects.Count > 0)
        {
            try
            {
                loaded = await LoadWithMsBuildAsync(projects);
            }
            catch (Exception ex)
            {
                Log($"MSBuildWorkspace failed, falling back to an ad-hoc compilation: {ex.Message}");
                _out.Diagnostics.Add(new Diagnostic { Level = "warn", Message = $"MSBuildWorkspace failed ({ex.Message}); used an ad-hoc compilation (less precise)." });
            }
        }
        if (!loaded) LoadAdhoc(projects);
        Log($"loaded {_docs.Count} documents in {_clock.ElapsedMilliseconds} ms");
    }

    private async Task<bool> LoadWithMsBuildAsync(List<string> projects)
    {
        EnsureRestored(projects);
        _workspace = MSBuildWorkspace.Create(new Dictionary<string, string> { ["Configuration"] = "Debug" });
        _workspace.RegisterWorkspaceFailedHandler(e =>
        {
            if (e.Diagnostic.Kind == WorkspaceDiagnosticKind.Failure) Log($"workspace: {e.Diagnostic.Message}");
        });
        foreach (var relative in projects)
        {
            var full = FullPath(relative);
            if (_workspace.CurrentSolution.Projects.Any(p => SamePath(p.FilePath, full))) continue;
            await _workspace.OpenProjectAsync(full);
        }
        foreach (var project in _workspace.CurrentSolution.Projects)
        {
            if (project.Language != LanguageNames.CSharp || project.FilePath is null) continue;
            var compilation = await project.GetCompilationAsync();
            if (compilation is null) continue;
            var projectRel = Relative(project.FilePath);
            var projectDir = projectRel is null ? "" : Path.GetDirectoryName(projectRel)!.Replace('\\', '/');
            var isTest = IsTestProject(project.FilePath);
            foreach (var document in project.Documents)
            {
                var rel = document.FilePath is null ? null : Relative(document.FilePath);
                if (rel is null || !rel.EndsWith(".cs", StringComparison.Ordinal) || !_files.TryGetValue(rel, out var entry)) continue;
                var tree = await document.GetSyntaxTreeAsync();
                if (tree is null) continue;
                AddDoc(new DocInfo(tree, compilation.GetSemanticModel(tree), entry, isTest, projectDir));
            }
        }
        return _docs.Count > 0;
    }

    /// <summary>No MSBuild: one compilation with every file, referencing the running .NET + ASP.NET Core frameworks.</summary>
    private void LoadAdhoc(List<string> projects)
    {
        var parse = new CSharpParseOptions(LanguageVersion.Preview);
        var trees = new List<(SyntaxTree Tree, FileEntry File)>();
        foreach (var entry in _files.Values.Where(f => f.Path.EndsWith(".cs", StringComparison.Ordinal)))
        {
            var text = File.ReadAllText(FullPath(entry.Path));
            trees.Add((CSharpSyntaxTree.ParseText(text, parse, FullPath(entry.Path)), entry));
        }
        const string implicitUsings = "global using System; global using System.Collections.Generic; global using System.IO; global using System.Linq; global using System.Net.Http; global using System.Threading; global using System.Threading.Tasks; global using Microsoft.AspNetCore.Builder; global using Microsoft.AspNetCore.Hosting; global using Microsoft.AspNetCore.Http; global using Microsoft.AspNetCore.Routing; global using Microsoft.Extensions.Configuration; global using Microsoft.Extensions.DependencyInjection; global using Microsoft.Extensions.Hosting; global using Microsoft.Extensions.Logging;";
        var usings = CSharpSyntaxTree.ParseText(implicitUsings, parse);
        var references = new List<MetadataReference>();
        var tpa = (AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") as string ?? "").Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries);
        references.AddRange(tpa.Where(File.Exists).Select(p => MetadataReference.CreateFromFile(p)));
        var runtimeDir = Path.GetDirectoryName(typeof(object).Assembly.Location)!;
        var aspnetRoot = Path.GetFullPath(Path.Combine(runtimeDir, "..", "..", "Microsoft.AspNetCore.App"));
        if (Directory.Exists(aspnetRoot))
        {
            var latest = Directory.GetDirectories(aspnetRoot).OrderBy(d => d, StringComparer.Ordinal).LastOrDefault();
            if (latest is not null) references.AddRange(Directory.GetFiles(latest, "*.dll").Select(p => MetadataReference.CreateFromFile(p)));
        }
        var compilation = CSharpCompilation.Create(
            "repomap-adhoc",
            [usings, .. trees.Select(t => t.Tree)],
            references,
            new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary, nullableContextOptions: NullableContextOptions.Enable));
        var testDirs = projects.Where(p => IsTestProject(FullPath(p))).Select(p => Path.GetDirectoryName(p)!.Replace('\\', '/') + "/").ToList();
        foreach (var (tree, entry) in trees)
        {
            var projectDir = projects.Select(p => Path.GetDirectoryName(p)!.Replace('\\', '/')).Where(d => entry.Path.StartsWith(d + "/", StringComparison.Ordinal)).OrderByDescending(d => d.Length).FirstOrDefault() ?? "";
            AddDoc(new DocInfo(tree, compilation.GetSemanticModel(tree), entry, testDirs.Any(d => entry.Path.StartsWith(d, StringComparison.Ordinal)), projectDir));
        }
    }

    private void AddDoc(DocInfo doc)
    {
        if (_docByTree.ContainsKey(doc.Tree)) return;
        _docs.Add(doc);
        _docByTree[doc.Tree] = doc;
        _out.Claims.Add(doc.File.Path);
    }

    private void EnsureRestored(List<string> projects)
    {
        foreach (var project in projects)
        {
            var assets = Path.Combine(Path.GetDirectoryName(FullPath(project))!, "obj", "project.assets.json");
            if (File.Exists(assets)) continue;
            Log($"restoring {project}…");
            using var process = Process.Start(new ProcessStartInfo("dotnet", ["restore", FullPath(project), "-v", "q", "-nologo"])
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            });
            process?.WaitForExit(180_000);
        }
    }

    private string FullPath(string relative) => Path.GetFullPath(Path.Combine(_request.RepoRoot, relative));

    private string? Relative(string path)
    {
        var rel = Path.GetRelativePath(_request.RepoRoot, path).Replace('\\', '/');
        return rel.StartsWith("../", StringComparison.Ordinal) ? null : rel;
    }

    private static bool SamePath(string? a, string b) => a is not null && string.Equals(Path.GetFullPath(a), b, StringComparison.OrdinalIgnoreCase);

    private static bool IsTestProject(string csprojPath)
    {
        try
        {
            var text = File.ReadAllText(csprojPath);
            return text.Contains("Microsoft.NET.Test.Sdk", StringComparison.OrdinalIgnoreCase)
                || text.Contains("<IsTestProject>true", StringComparison.OrdinalIgnoreCase);
        }
        catch (IOException)
        {
            return false;
        }
    }

    // ------------------------------------------------------------------ analysis

    private void Analyze()
    {
        CollectTypes();
        FindDbContextsAndEntities();
        InterpretMinimalApis();
        ExtractControllers();
        ExtractMiddlewareRoutes();
        CollectDependencyInjection();
        ClassifyTypes();
        EmitTypeNodes();
        EmitEndpointNodes();
        WalkReferences();
        EmitSignatureEdges();
        EmitConfigurationEdges();
        _out.DropRedundantUses();
        Log($"{_types.Count} types, {_endpoints.Count} endpoints in {_clock.ElapsedMilliseconds} ms");
    }

    private void CollectTypes()
    {
        foreach (var doc in _docs)
        {
            var root = doc.Tree.GetRoot();
            if (root is CompilationUnitSyntax unit && unit.Members.OfType<GlobalStatementSyntax>().FirstOrDefault() is { } first)
            {
                var program = doc.Model.Compilation.GetEntryPoint(default)?.ContainingType;
                if (program is not null && !_types.ContainsKey(program))
                {
                    _programType = program;
                    var assembly = doc.Model.Compilation.AssemblyName ?? "App";
                    var fullName = program.ContainingNamespace.IsGlobalNamespace ? $"{assembly}.{program.Name}" : Syntax.FullName(program);
                    _types[program] = new TypeNode { Id = $"{doc.File.Layer}:class:{fullName}", Symbol = program, Doc = doc, Declaration = first, Kind = "entrypoint" };
                }
            }
            foreach (var declaration in root.DescendantNodes().OfType<BaseTypeDeclarationSyntax>())
            {
                if (doc.Model.GetDeclaredSymbol(declaration) is not INamedTypeSymbol symbol) continue;
                symbol = symbol.OriginalDefinition;
                if (Syntax.InheritsFrom(symbol, "Migration") || Syntax.InheritsFrom(symbol, "ModelSnapshot"))
                {
                    _efTypes.Add(symbol);
                    continue;
                }
                if (symbol.ContainingType is not null && symbol.DeclaredAccessibility is Accessibility.Private or Accessibility.Protected) continue;
                if (_types.TryGetValue(symbol, out var existing))
                {
                    // Partial type: prefer a declaration that is not generated.
                    if (existing.Doc.File.Role == "generated" && doc.File.Role != "generated")
                        _types[symbol] = new TypeNode { Id = existing.Id, Symbol = symbol, Doc = doc, Declaration = declaration, Kind = existing.Kind };
                    continue;
                }
                _types[symbol] = new TypeNode { Id = $"{doc.File.Layer}:class:{Syntax.FullName(symbol)}", Symbol = symbol, Doc = doc, Declaration = declaration };
            }
        }
    }

    private void FindDbContextsAndEntities()
    {
        foreach (var symbol in _types.Keys)
        {
            if (!Syntax.InheritsFrom(symbol, "DbContext")) continue;
            _dbContexts.Add(symbol);
            foreach (var property in symbol.GetMembers().OfType<IPropertySymbol>())
            {
                if (property.Type is INamedTypeSymbol { Name: "DbSet", TypeArguments.Length: 1 } set && set.TypeArguments[0] is INamedTypeSymbol entity && _types.ContainsKey(entity.OriginalDefinition))
                    _entities.Add(entity.OriginalDefinition);
            }
        }
        // modelBuilder.Entity<T>(…)
        foreach (var doc in _docs)
        {
            foreach (var generic in doc.Tree.GetRoot().DescendantNodes().OfType<GenericNameSyntax>())
            {
                if (generic.Identifier.Text != "Entity" || generic.TypeArgumentList.Arguments.Count != 1) continue;
                if (doc.Model.GetTypeInfo(generic.TypeArgumentList.Arguments[0]).Type is INamedTypeSymbol entity && _types.ContainsKey(entity.OriginalDefinition))
                    _entities.Add(entity.OriginalDefinition);
            }
        }
    }

    // ------------------------------------------------------------------ minimal APIs

    private void InterpretMinimalApis()
    {
        foreach (var doc in _docs)
        {
            if (doc.Tree.GetRoot() is CompilationUnitSyntax unit && unit.Members.OfType<GlobalStatementSyntax>().Any() && _programType is not null)
                Interpret(unit, doc, [], _programType, 0, []);
        }
        // Map* calls not reachable from Program (Startup classes, unusual registration): root prefix.
        foreach (var doc in _docs)
        {
            foreach (var invocation in doc.Tree.GetRoot().DescendantNodes().OfType<InvocationExpressionSyntax>())
            {
                if (_processedMaps.Contains(invocation) || !MapVerbs.ContainsKey(Syntax.MethodName(invocation))) continue;
                var receiver = Syntax.Receiver(invocation);
                if (receiver is null || !IsRouteBuilder(receiver, doc)) continue;
                var owner = OwnerTypeAt(invocation, doc);
                if (owner is null) continue;
                _processedMaps.Add(invocation);
                MapEndpoint(invocation, RouteScope.Root, doc, owner);
            }
        }
    }

    private void Interpret(SyntaxNode body, DocInfo doc, Dictionary<string, RouteScope> env, INamedTypeSymbol owner, int depth, HashSet<string> visiting)
    {
        foreach (var node in body.DescendantNodes())
        {
            switch (node)
            {
                case VariableDeclaratorSyntax { Initializer.Value: var value } declarator:
                    if (ScopeOf(value, doc, env) is { } scope) env[declarator.Identifier.Text] = scope;
                    break;
                case AssignmentExpressionSyntax { Left: IdentifierNameSyntax target } assignment:
                    if (ScopeOf(assignment.Right, doc, env) is { } assigned) env[target.Identifier.Text] = assigned;
                    break;
                case InvocationExpressionSyntax invocation:
                    HandleInvocation(invocation, doc, env, owner, depth, visiting);
                    break;
            }
        }
    }

    private void HandleInvocation(InvocationExpressionSyntax invocation, DocInfo doc, Dictionary<string, RouteScope> env, INamedTypeSymbol owner, int depth, HashSet<string> visiting)
    {
        var name = Syntax.MethodName(invocation);
        var receiver = Syntax.Receiver(invocation);
        if (MapVerbs.ContainsKey(name) && receiver is not null)
        {
            var scope = ScopeOf(receiver, doc, env) ?? (IsRouteBuilder(receiver, doc) ? RouteScope.Root : null);
            if (scope is null || !_processedMaps.Add(invocation)) return;
            MapEndpoint(invocation, scope, doc, OwnerTypeAt(invocation, doc) ?? owner);
            return;
        }
        // A method of ours that receives a route builder (e.g. api.MapAuthEndpoints()): interpret its body.
        var info = doc.Model.GetSymbolInfo(invocation);
        if ((info.Symbol ?? info.CandidateSymbols.FirstOrDefault()) is not IMethodSymbol method) return;
        var definition = (method.ReducedFrom ?? method).OriginalDefinition;
        var reference = definition.DeclaringSyntaxReferences.FirstOrDefault();
        if (reference is null || !_docByTree.TryGetValue(reference.SyntaxTree, out var targetDoc)) return;
        var declaration = reference.GetSyntax();
        SyntaxNode? body = declaration switch
        {
            BaseMethodDeclarationSyntax m => (SyntaxNode?)m.Body ?? m.ExpressionBody,
            LocalFunctionStatementSyntax f => (SyntaxNode?)f.Body ?? f.ExpressionBody,
            _ => null,
        };
        if (body is null) return;
        var bindings = new Dictionary<string, RouteScope>();
        if (method.ReducedFrom is not null && receiver is not null && definition.Parameters.Length > 0)
        {
            var scope = ScopeOf(receiver, doc, env) ?? (IsRouteBuilder(receiver, doc) ? RouteScope.Root : null);
            if (scope is not null) bindings[definition.Parameters[0].Name] = scope;
        }
        var arguments = invocation.ArgumentList.Arguments;
        var offset = method.ReducedFrom is not null ? 1 : 0;
        for (var i = 0; i < arguments.Count; i++)
        {
            var scope = ScopeOf(arguments[i].Expression, doc, env);
            if (scope is null) continue;
            var parameter = arguments[i].NameColon is { } named
                ? definition.Parameters.FirstOrDefault(p => p.Name == named.Name.Identifier.Text)
                : i + offset < definition.Parameters.Length ? definition.Parameters[i + offset] : null;
            if (parameter is not null) bindings[parameter.Name] = scope;
        }
        if (bindings.Count == 0 || depth > 8) return;
        var key = definition.ToDisplayString() + "|" + string.Join(",", bindings.OrderBy(b => b.Key).Select(b => $"{b.Key}={b.Value.Prefix}"));
        if (!visiting.Add(key)) return;
        Interpret(body, targetDoc, bindings, definition.ContainingType.OriginalDefinition, depth + 1, visiting);
    }

    private RouteScope? ScopeOf(ExpressionSyntax expression, DocInfo doc, Dictionary<string, RouteScope> env)
    {
        switch (expression)
        {
            case IdentifierNameSyntax identifier:
                if (env.TryGetValue(identifier.Identifier.Text, out var known)) return known;
                return IsRouteBuilder(identifier, doc) ? RouteScope.Root : null;
            case ParenthesizedExpressionSyntax parenthesized:
                return ScopeOf(parenthesized.Expression, doc, env);
            case InvocationExpressionSyntax invocation:
            {
                var name = Syntax.MethodName(invocation);
                var receiver = Syntax.Receiver(invocation);
                if (receiver is null) return null;
                if (name == "MapGroup")
                {
                    var inner = ScopeOf(receiver, doc, env) ?? (IsRouteBuilder(receiver, doc) ? RouteScope.Root : null);
                    if (inner is null) return null;
                    var prefix = invocation.ArgumentList.Arguments.Count > 0 ? Syntax.StaticString(invocation.ArgumentList.Arguments[0].Expression, doc.Model) : null;
                    return inner with { Prefix = Syntax.JoinRoute(inner.Prefix, prefix ?? "{group}") };
                }
                if (GroupModifiers.Contains(name))
                {
                    var inner = ScopeOf(receiver, doc, env);
                    if (inner is null) return null;
                    return name switch
                    {
                        "RequireAuthorization" => inner with { Auth = "required" },
                        "AllowAnonymous" => inner with { Auth = "anonymous" },
                        "WithTags" => inner with { Tags = [.. inner.Tags, .. invocation.ArgumentList.Arguments.Select(a => Syntax.StaticString(a.Expression, doc.Model)).OfType<string>()] },
                        _ => inner,
                    };
                }
                return null;
            }
            default:
                return null;
        }
    }

    private static readonly HashSet<string> RouteBuilderTypes = ["WebApplication", "IEndpointRouteBuilder", "RouteGroupBuilder", "IApplicationBuilder"];

    private static bool IsRouteBuilder(ExpressionSyntax expression, DocInfo doc)
    {
        var type = doc.Model.GetTypeInfo(expression).Type;
        if (type is not null && type.TypeKind != TypeKind.Error)
            return RouteBuilderTypes.Contains(type.Name) || type.AllInterfaces.Any(i => i.Name == "IEndpointRouteBuilder");
        if (type is { TypeKind: TypeKind.Error } && RouteBuilderTypes.Contains(type.Name)) return true;
        // Without type information: conventional names.
        return expression is IdentifierNameSyntax { Identifier.Text: "app" or "endpoints" or "routes" };
    }

    private void MapEndpoint(InvocationExpressionSyntax invocation, RouteScope scope, DocInfo doc, INamedTypeSymbol owner)
    {
        var name = Syntax.MethodName(invocation);
        var arguments = invocation.ArgumentList.Arguments;
        string? Arg(int index) => index < arguments.Count ? Syntax.StaticString(arguments[index].Expression, doc.Model) : null;
        string? pattern;
        ExpressionSyntax? handler = null;
        string[] methods;
        string? special = null;
        switch (name)
        {
            case "MapOpenApi":
                pattern = Arg(0) ?? "/openapi/{documentName}.json";
                methods = ["GET"];
                special = "OpenAPI document";
                break;
            case "MapHealthChecks":
                pattern = Arg(0);
                methods = ["ANY"];
                special = "health checks";
                break;
            case "MapHub":
                pattern = Arg(0);
                methods = ["ANY"];
                special = "SignalR hub";
                break;
            case "MapFallback":
            case "MapFallbackToFile":
                pattern = arguments.Count > 1 ? Arg(0) : "{*path}";
                handler = arguments.Count > 1 ? arguments[1].Expression : null;
                methods = [name == "MapFallback" ? "ANY" : "GET"];
                special = "fallback";
                break;
            case "MapMethods":
                pattern = Arg(0);
                methods = arguments.Count > 1 ? StringList(arguments[1].Expression, doc).Select(m => m.ToUpperInvariant()).ToArray() : ["ANY"];
                handler = arguments.Count > 2 ? arguments[2].Expression : null;
                break;
            default:
                pattern = Arg(0);
                handler = arguments.Count > 1 ? arguments[1].Expression : null;
                methods = [MapVerbs[name]];
                break;
        }
        if (methods.Length == 0) methods = ["ANY"];
        if (pattern is null)
        {
            pattern = "{dynamic}";
            _out.Diagnostics.Add(new Diagnostic { Level = "info", Message = $"{name}: route pattern is not static", File = doc.File.Path, Line = Syntax.Line(invocation) });
        }
        var route = Syntax.JoinRoute(scope.Prefix, pattern);

        // Fluent modifiers: .WithName("x").RequireAuthorization()…
        string? endpointName = null, auth = scope.Auth, summary = null;
        var tags = scope.Tags.ToList();
        SyntaxNode current = invocation;
        while (current.Parent is MemberAccessExpressionSyntax member && member.Expression == current && member.Parent is InvocationExpressionSyntax outer)
        {
            var modifier = member.Name.Identifier.Text;
            var first = outer.ArgumentList.Arguments.Count > 0 ? Syntax.StaticString(outer.ArgumentList.Arguments[0].Expression, doc.Model) : null;
            switch (modifier)
            {
                case "WithName": endpointName = first; break;
                case "RequireAuthorization": auth = "required"; break;
                case "AllowAnonymous": auth = "anonymous"; break;
                case "WithTags": tags.AddRange(outer.ArgumentList.Arguments.Select(a => Syntax.StaticString(a.Expression, doc.Model)).OfType<string>()); break;
                case "WithSummary" or "WithDescription": summary ??= first; break;
            }
            current = outer;
        }

        IMethodSymbol? handlerMethod = null;
        SyntaxNode? handlerLambda = null;
        if (handler is AnonymousFunctionExpressionSyntax lambda) handlerLambda = lambda;
        else if (handler is not null)
        {
            var info = doc.Model.GetSymbolInfo(handler);
            handlerMethod = ((info.Symbol ?? info.CandidateSymbols.FirstOrDefault()) as IMethodSymbol)?.OriginalDefinition;
            _handlerArguments.Add(handler);
        }

        foreach (var method in methods.Distinct())
        {
            var id = $"{doc.File.Layer}:route:{method} {route}";
            if (_endpoints.ContainsKey(id)) continue;
            _endpoints[id] = new EndpointInfo
            {
                Id = id, Method = method, Route = route, Doc = doc, MappedAt = invocation, OwnerType = owner,
                HandlerMethod = handlerMethod, HandlerLambda = handlerLambda, Name = endpointName, Auth = auth,
                Tags = tags, Summary = summary, Special = special,
            };
            if (handlerMethod is not null) AddToList(_handlerMethods, handlerMethod, id);
            if (handlerLambda is not null) AddToList(_handlerLambdas, handlerLambda, id);
        }
        _endpointOwners.Add(owner);
        if (handlerMethod?.ContainingType is { } handlerType) _endpointOwners.Add(handlerType.OriginalDefinition);
    }

    private static IEnumerable<string> StringList(ExpressionSyntax expression, DocInfo doc)
    {
        IEnumerable<ExpressionSyntax> items = expression switch
        {
            CollectionExpressionSyntax collection => collection.Elements.OfType<ExpressionElementSyntax>().Select(e => e.Expression),
            ImplicitArrayCreationExpressionSyntax implicitArray => implicitArray.Initializer.Expressions,
            ArrayCreationExpressionSyntax array => array.Initializer?.Expressions ?? [],
            _ => [],
        };
        return items.Select(i => Syntax.StaticString(i, doc.Model)).OfType<string>();
    }

    private static void AddToList<TKey>(Dictionary<TKey, List<string>> map, TKey key, string value) where TKey : notnull
    {
        if (!map.TryGetValue(key, out var list)) map[key] = list = [];
        if (!list.Contains(value)) list.Add(value);
    }

    // ------------------------------------------------------------------ controllers

    private void ExtractControllers()
    {
        foreach (var (symbol, node) in _types)
        {
            if (!IsController(symbol, node)) continue;
            var classRoute = RouteAttribute(node.Declaration as MemberDeclarationSyntax, node.Doc);
            var controllerName = symbol.Name.EndsWith("Controller", StringComparison.Ordinal) ? symbol.Name[..^"Controller".Length] : symbol.Name;
            foreach (var method in node.Declaration.DescendantNodes().OfType<MethodDeclarationSyntax>())
            {
                if (!method.Modifiers.Any(SyntaxKind.PublicKeyword) || method.Modifiers.Any(SyntaxKind.StaticKeyword)) continue;
                var attributes = method.AttributeLists.SelectMany(l => l.Attributes).ToList();
                if (attributes.Any(a => AttributeName(a) == "NonAction")) continue;
                var methodRoute = RouteAttribute(method, node.Doc);
                var verbs = attributes
                    .Select(a => (Attribute: a, Name: AttributeName(a)))
                    .Where(a => a.Name.StartsWith("Http", StringComparison.Ordinal) && a.Name.Length > 4)
                    .ToList();
                if (verbs.Count == 0 && methodRoute is null) continue;
                if (verbs.Count == 0) verbs.Add((attributes.First(), "HttpAny"));
                foreach (var (attribute, verbName) in verbs)
                {
                    var template = attribute.ArgumentList?.Arguments.FirstOrDefault(a => a.NameEquals is null) is { } arg
                        ? Syntax.StaticString(arg.Expression, node.Doc.Model)
                        : null;
                    template ??= methodRoute;
                    var route = template is not null && (template.StartsWith('/') || template.StartsWith("~/", StringComparison.Ordinal))
                        ? "/" + template.TrimStart('~', '/')
                        : Syntax.JoinRoute(classRoute, template);
                    route = route.Replace("[controller]", controllerName, StringComparison.OrdinalIgnoreCase)
                        .Replace("[action]", method.Identifier.Text, StringComparison.OrdinalIgnoreCase);
                    var verb = verbName == "HttpAny" ? "ANY" : verbName[4..].ToUpperInvariant();
                    var id = $"{node.Doc.File.Layer}:route:{verb} {route}";
                    if (_endpoints.ContainsKey(id)) continue;
                    var handler = node.Doc.Model.GetDeclaredSymbol(method)?.OriginalDefinition;
                    _endpoints[id] = new EndpointInfo
                    {
                        Id = id, Method = verb, Route = route, Doc = node.Doc, MappedAt = method, OwnerType = symbol, HandlerMethod = handler,
                        Auth = attributes.Any(a => AttributeName(a) == "AllowAnonymous") ? "anonymous" : attributes.Any(a => AttributeName(a) == "Authorize") ? "required" : null,
                    };
                    if (handler is not null) AddToList(_handlerMethods, handler, id);
                }
            }
        }
    }

    private static string AttributeName(AttributeSyntax attribute)
    {
        var name = attribute.Name switch
        {
            QualifiedNameSyntax qualified => qualified.Right.Identifier.Text,
            SimpleNameSyntax simple => simple.Identifier.Text,
            _ => attribute.Name.ToString(),
        };
        return name.EndsWith("Attribute", StringComparison.Ordinal) ? name[..^"Attribute".Length] : name;
    }

    private static string? RouteAttribute(MemberDeclarationSyntax? member, DocInfo doc)
    {
        var attribute = member?.AttributeLists.SelectMany(l => l.Attributes).FirstOrDefault(a => AttributeName(a) == "Route");
        var argument = attribute?.ArgumentList?.Arguments.FirstOrDefault();
        return argument is null ? null : Syntax.StaticString(argument.Expression, doc.Model);
    }

    private static bool IsController(INamedTypeSymbol symbol, TypeNode node) =>
        Syntax.InheritsFrom(symbol, "ControllerBase") || Syntax.InheritsFrom(symbol, "Controller")
        || (node.Declaration is MemberDeclarationSyntax member && member.AttributeLists.SelectMany(l => l.Attributes).Any(a => AttributeName(a) == "ApiController"));

    // ------------------------------------------------------------------ middleware & auth callback routes

    private void ExtractMiddlewareRoutes()
    {
        foreach (var doc in _docs)
        {
            foreach (var node in doc.Tree.GetRoot().DescendantNodes())
            {
                switch (node)
                {
                    case BinaryExpressionSyntax binary when binary.IsKind(SyntaxKind.EqualsExpression) || binary.IsKind(SyntaxKind.NotEqualsExpression):
                    {
                        var other = IsRequestPath(binary.Left) ? binary.Right : IsRequestPath(binary.Right) ? binary.Left : null;
                        var path = other is null ? null : Syntax.StaticString(other, doc.Model);
                        if (path?.StartsWith('/') == true) AddMiddlewareRoute(path, binary, doc);
                        break;
                    }
                    case InvocationExpressionSyntax invocation when Syntax.MethodName(invocation) is "StartsWithSegments" or "Equals"
                        && Syntax.Receiver(invocation) is { } receiver && IsRequestPath(receiver) && invocation.ArgumentList.Arguments.Count > 0:
                    {
                        var path = Syntax.StaticString(invocation.ArgumentList.Arguments[0].Expression, doc.Model);
                        if (path?.StartsWith('/') == true) AddMiddlewareRoute(path, invocation, doc);
                        break;
                    }
                    case AssignmentExpressionSyntax assignment when LastName(assignment.Left) == "CallbackPath":
                    {
                        var path = Syntax.StaticString(assignment.Right, doc.Model);
                        if (path?.StartsWith('/') == true) AddCallbackRoute(path, assignment, doc);
                        break;
                    }
                }
            }
        }
    }

    private static string? LastName(ExpressionSyntax expression) => expression switch
    {
        MemberAccessExpressionSyntax member => member.Name.Identifier.Text,
        IdentifierNameSyntax identifier => identifier.Identifier.Text,
        _ => null,
    };

    private static bool IsRequestPath(ExpressionSyntax expression) =>
        expression is MemberAccessExpressionSyntax { Name.Identifier.Text: "Path", Expression: MemberAccessExpressionSyntax { Name.Identifier.Text: "Request" } };

    private void AddMiddlewareRoute(string path, SyntaxNode at, DocInfo doc)
    {
        var owner = OwnerTypeAt(at, doc);
        if (owner is null) return;
        var id = $"{doc.File.Layer}:route:ANY {path}";
        if (_endpoints.ContainsKey(id)) return;
        var lambda = at.Ancestors().OfType<AnonymousFunctionExpressionSyntax>().LastOrDefault();
        _endpoints[id] = new EndpointInfo
        {
            Id = id, Method = "ANY", Route = path, Doc = doc, MappedAt = at, OwnerType = owner, HandlerLambda = lambda,
            Special = "middleware", Summary = "Handled by middleware that checks the request path.",
            Extra = { ["middleware"] = true },
        };
        if (lambda is not null && !_handlerLambdas.ContainsKey(lambda)) AddToList(_handlerLambdas, lambda, id);
    }

    private void AddCallbackRoute(string path, SyntaxNode at, DocInfo doc)
    {
        var owner = OwnerTypeAt(at, doc);
        if (owner is null) return;
        var id = $"{doc.File.Layer}:route:GET {path}";
        if (_endpoints.ContainsKey(id)) return;
        // The options lambda of AddGoogle(options => …) owns the callback's event handlers.
        var lambda = at.Ancestors().OfType<AnonymousFunctionExpressionSyntax>()
            .FirstOrDefault(l => l.Parent is ArgumentSyntax { Parent.Parent: InvocationExpressionSyntax });
        var scheme = lambda?.Parent?.Parent?.Parent is InvocationExpressionSyntax invocation ? Syntax.MethodName(invocation).Replace("Add", "") : "external";
        _endpoints[id] = new EndpointInfo
        {
            Id = id, Method = "GET", Route = path, Doc = doc, MappedAt = at, OwnerType = owner, HandlerLambda = lambda,
            Special = $"{scheme} sign-in callback",
            Summary = $"OAuth callback handled by the {scheme} authentication handler (not a mapped endpoint).",
            Extra = { ["callback"] = scheme },
        };
        if (lambda is not null && !_handlerLambdas.ContainsKey(lambda)) AddToList(_handlerLambdas, lambda, id);
    }

    // ------------------------------------------------------------------ dependency injection

    private void CollectDependencyInjection()
    {
        foreach (var doc in _docs)
        {
            foreach (var invocation in doc.Tree.GetRoot().DescendantNodes().OfType<InvocationExpressionSyntax>())
            {
                var name = Syntax.MethodName(invocation);
                if (!DiMethods.TryGetValue(name, out var lifetime)) continue;
                var typeArguments = GenericArguments(invocation).Select(t => doc.Model.GetTypeInfo(t).Type).OfType<INamedTypeSymbol>().ToList();
                typeArguments.AddRange(invocation.ArgumentList.Arguments
                    .Select(a => a.Expression)
                    .OfType<TypeOfExpressionSyntax>()
                    .Select(t => doc.Model.GetTypeInfo(t.Type).Type)
                    .OfType<INamedTypeSymbol>());
                foreach (var type in typeArguments.Select(t => t.OriginalDefinition))
                {
                    if (!_types.ContainsKey(type)) continue;
                    if (lifetime == "options") _optionsBound.Add(type);
                    else _registered[type] = lifetime;
                }
            }
        }
        foreach (var (symbol, node) in _types)
        {
            if (symbol.IsRecord) continue;
            foreach (var constructor in symbol.InstanceConstructors)
                foreach (var parameter in constructor.Parameters)
                    foreach (var type in Syntax.Unwrap(parameter.Type))
                        if (_types.ContainsKey(type)) _injected.Add(type);
        }
        foreach (var endpoint in _endpoints.Values)
        {
            var method = HandlerSymbol(endpoint);
            if (method is null) continue;
            foreach (var parameter in method.Parameters)
                foreach (var type in Syntax.Unwrap(parameter.Type))
                    if (_types.ContainsKey(type)) _injected.Add(type);
            foreach (var type in Syntax.Unwrap(method.ReturnType))
                if (_types.ContainsKey(type)) _returned.Add(type);
        }
    }

    private static IEnumerable<TypeSyntax> GenericArguments(InvocationExpressionSyntax invocation) => invocation.Expression switch
    {
        MemberAccessExpressionSyntax { Name: GenericNameSyntax generic } => generic.TypeArgumentList.Arguments,
        GenericNameSyntax generic => generic.TypeArgumentList.Arguments,
        _ => [],
    };

    private IMethodSymbol? HandlerSymbol(EndpointInfo endpoint)
    {
        if (endpoint.HandlerMethod is not null) return endpoint.HandlerMethod;
        if (endpoint.HandlerLambda is null || endpoint.Special is not null) return null;
        var doc = _docByTree.GetValueOrDefault(endpoint.HandlerLambda.SyntaxTree);
        return doc?.Model.GetSymbolInfo(endpoint.HandlerLambda).Symbol as IMethodSymbol;
    }

    // ------------------------------------------------------------------ classification

    private void ClassifyTypes()
    {
        foreach (var (symbol, node) in _types)
        {
            if (SymbolEqualityComparer.Default.Equals(symbol, _programType))
            {
                node.Kind = "entrypoint";
                continue;
            }
            var fileRole = node.Doc.File.Role;
            if (node.Doc.IsTestProject || fileRole.StartsWith("test", StringComparison.Ordinal))
            {
                var tests = symbol.GetMembers().OfType<IMethodSymbol>()
                    .Where(m => m.DeclaringSyntaxReferences.Any(r => r.GetSyntax() is MethodDeclarationSyntax md
                        && md.AttributeLists.SelectMany(l => l.Attributes).Any(a => TestAttributes.Contains(AttributeName(a)))))
                    .Select(m => m.Name)
                    .ToList();
                if (tests.Count > 0)
                {
                    node.Kind = "test-suite";
                    node.Role = fileRole.StartsWith("test/", StringComparison.Ordinal) && fileRole != "test/support" ? fileRole : "test/unit";
                    node.RoleReason = "class with test methods";
                    node.Attrs["tests"] = tests.Select(t => t.Replace('_', ' ')).ToList();
                    node.Attrs["testCount"] = tests.Count;
                }
                else
                {
                    node.Kind = "test-helper";
                    node.Role = "test/support";
                    node.RoleReason = "test project class without test methods";
                }
                continue;
            }
            node.Kind = symbol switch
            {
                _ when _dbContexts.Contains(symbol) => "dbcontext",
                _ when IsController(symbol, node) => "controller",
                _ when IsSetup(symbol) => "setup",
                _ when _endpointOwners.Contains(symbol) => "endpoint-group",
                _ when _entities.Contains(symbol) => "entity",
                _ when IsMiddleware(symbol) => "middleware",
                { TypeKind: TypeKind.Enum } => "enum",
                { TypeKind: TypeKind.Interface } => "interface",
                _ when IsOptions(symbol) => "options",
                _ when IsDto(symbol) => "dto",
                _ when IsService(symbol) => "service",
                _ => "class",
            };
        }
    }

    private static readonly HashSet<string> SetupReceivers =
        ["WebApplicationBuilder", "IServiceCollection", "IHostApplicationBuilder", "IHostBuilder", "WebApplication", "IApplicationBuilder"];

    private static bool IsSetup(INamedTypeSymbol symbol) =>
        symbol.IsStatic && symbol.GetMembers().OfType<IMethodSymbol>().Any(m => m.IsExtensionMethod && m.Parameters.Length > 0 && SetupReceivers.Contains(m.Parameters[0].Type.Name));

    private static bool IsMiddleware(INamedTypeSymbol symbol) =>
        Syntax.Implements(symbol, "IMiddleware") || Syntax.Implements(symbol, "IStartupFilter") || Syntax.Implements(symbol, "IEndpointFilter")
        || symbol.GetMembers().OfType<IMethodSymbol>().Any(m => m.Name is "Invoke" or "InvokeAsync" && m.Parameters.Any(p => p.Type.Name == "HttpContext"));

    private bool IsOptions(INamedTypeSymbol symbol) =>
        _optionsBound.Contains(symbol)
        || symbol.GetMembers("SectionName").Any(m => m is IFieldSymbol { IsConst: true })
        || symbol.Name.EndsWith("Options", StringComparison.Ordinal) || symbol.Name.EndsWith("Settings", StringComparison.Ordinal);

    private bool IsDto(INamedTypeSymbol symbol) =>
        symbol.IsRecord || _returned.Contains(symbol)
        || new[] { "Request", "Response", "Dto", "Command", "Query", "Result", "Payload", "ViewModel" }.Any(s => symbol.Name.EndsWith(s, StringComparison.Ordinal));

    private bool IsService(INamedTypeSymbol symbol) =>
        _registered.ContainsKey(symbol) || _injected.Contains(symbol)
        || new[] { "Service", "Repository", "Handler", "Client", "Provider", "Manager", "Store", "Gateway" }.Any(s => symbol.Name.EndsWith(s, StringComparison.Ordinal));

    // ------------------------------------------------------------------ nodes

    private void EmitTypeNodes()
    {
        foreach (var (symbol, node) in _types)
        {
            var file = node.Doc.File.Path;
            var feature = Syntax.FeatureOf(file);
            var attrs = node.Attrs;
            if (!symbol.ContainingNamespace.IsGlobalNamespace) attrs["namespace"] = symbol.ContainingNamespace.ToDisplayString();
            if (_registered.TryGetValue(symbol, out var lifetime)) attrs["lifetime"] = lifetime;
            if (symbol.IsStatic) attrs["static"] = true;
            if (symbol.IsRecord) attrs["record"] = true;
            if (node.Kind == "options" && symbol.GetMembers("SectionName").OfType<IFieldSymbol>().FirstOrDefault() is { HasConstantValue: true } section)
                attrs["configSection"] = section.ConstantValue;
            if (node.Kind == "dbcontext")
            {
                attrs["dbSets"] = symbol.GetMembers().OfType<IPropertySymbol>()
                    .Where(p => p.Type is INamedTypeSymbol { Name: "DbSet" })
                    .Select(p => $"{p.Name}: {((INamedTypeSymbol)p.Type).TypeArguments[0].Name}")
                    .ToList();
            }
            var description = Syntax.DocSummary(symbol);
            if (node.Kind == "entrypoint") description ??= "Composition root: registers services and maps the API";
            _out.AddNode(new OutNode
            {
                Id = node.Id,
                Label = node.Kind == "entrypoint" ? symbol.Name : Syntax.DisplayName(symbol),
                Kind = node.Kind,
                Role = node.Role,
                RoleReason = node.RoleReason,
                File = file,
                Line = Syntax.Line(node.Declaration),
                Tags = feature is null ? null : [$"feature:{feature}"],
                Attrs = attrs.Count > 0 ? attrs : null,
                Description = description,
                DescriptionSource = description is null ? null : "doc-comment",
            });

            if (node.Kind != "entity") continue;
            foreach (var property in symbol.GetMembers().OfType<IPropertySymbol>().Where(p => !p.IsStatic && !p.IsIndexer && p.DeclaredAccessibility == Accessibility.Public))
            {
                var id = $"{node.Doc.File.Layer}:property:{Syntax.FullName(symbol)}.{property.Name}";
                _entityProperties[property.OriginalDefinition] = id;
                var declaration = property.DeclaringSyntaxReferences.FirstOrDefault()?.GetSyntax();
                var summary = Syntax.DocSummary(property);
                _out.AddNode(new OutNode
                {
                    Id = id,
                    Label = $"{symbol.Name}.{property.Name}",
                    Kind = "property",
                    Parent = node.Id,
                    File = file,
                    Line = declaration is null ? null : Syntax.Line(declaration),
                    Tags = feature is null ? null : [$"feature:{feature}"],
                    Attrs = new() { ["type"] = property.Type.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat) },
                    Description = summary,
                    DescriptionSource = summary is null ? null : "doc-comment",
                });
            }
        }
    }

    private void EmitEndpointNodes()
    {
        foreach (var endpoint in _endpoints.Values)
        {
            var ownerNode = endpoint.OwnerType is not null ? _types.GetValueOrDefault(endpoint.OwnerType) : null;
            var handler = endpoint.HandlerMethod;
            var handlerDeclaration = handler?.DeclaringSyntaxReferences.FirstOrDefault()?.GetSyntax();
            var handlerDoc = handlerDeclaration is null ? null : _docByTree.GetValueOrDefault(handlerDeclaration.SyntaxTree);
            var file = handlerDoc?.File.Path ?? endpoint.Doc.File.Path;
            var line = handlerDeclaration is not null && handlerDoc is not null ? Syntax.Line(handlerDeclaration) : Syntax.Line(endpoint.MappedAt);
            var feature = Syntax.FeatureOf(file) ?? Syntax.FeatureOf(endpoint.Doc.File.Path);
            var attrs = new Dictionary<string, object?>
            {
                ["method"] = endpoint.Method,
                ["route"] = endpoint.Route,
                ["handler"] = handler is not null ? $"{handler.ContainingType.Name}.{handler.Name}" : endpoint.HandlerLambda is not null && endpoint.Special is null ? "lambda" : endpoint.Special,
                ["mappedAt"] = $"{endpoint.Doc.File.Path}:{Syntax.Line(endpoint.MappedAt)}",
            };
            if (endpoint.Name is not null) attrs["name"] = endpoint.Name;
            if (endpoint.Auth is not null) attrs["auth"] = endpoint.Auth;
            if (endpoint.Tags.Count > 0) attrs["openApiTags"] = endpoint.Tags;
            foreach (var (key, value) in endpoint.Extra) attrs[key] = value;
            var description = endpoint.Summary ?? Syntax.DocSummary(handler);
            _out.AddNode(new OutNode
            {
                Id = endpoint.Id,
                Label = $"{endpoint.Method} {endpoint.Route}",
                Kind = "endpoint",
                Parent = ownerNode?.Id,
                Role = ownerNode?.Role,
                RoleReason = ownerNode?.Role is null ? null : "declared in test code",
                File = file,
                Line = line,
                Tags = feature is null ? null : [$"feature:{feature}"],
                Attrs = attrs,
                Description = description,
                DescriptionSource = description is null ? null : endpoint.Summary is not null ? "manual" : "doc-comment",
            });
        }
    }

    // ------------------------------------------------------------------ references

    /// <summary>Which node(s) own code at this position: an endpoint handler, Program, or the enclosing type.</summary>
    private List<string> OwnersOf(SyntaxNode node, DocInfo doc)
    {
        foreach (var ancestor in node.AncestorsAndSelf())
        {
            if (_ownerCache.TryGetValue(ancestor, out var cached)) return cached;
            List<string>? owners = null;
            switch (ancestor)
            {
                case AnonymousFunctionExpressionSyntax lambda when _handlerLambdas.TryGetValue(lambda, out var lambdaOwners):
                    owners = lambdaOwners;
                    break;
                case BaseMethodDeclarationSyntax method when doc.Model.GetDeclaredSymbol(method) is IMethodSymbol symbol
                    && _handlerMethods.TryGetValue(symbol.OriginalDefinition, out var methodOwners):
                    owners = methodOwners;
                    break;
                case GlobalStatementSyntax when _programType is not null && _types.TryGetValue(_programType, out var program):
                    owners = [program.Id];
                    break;
                case BaseTypeDeclarationSyntax type:
                {
                    var symbol = doc.Model.GetDeclaredSymbol(type) as INamedTypeSymbol;
                    while (symbol is not null && !_types.ContainsKey(symbol.OriginalDefinition) && !_efTypes.Contains(symbol.OriginalDefinition))
                        symbol = symbol.ContainingType;
                    owners = symbol is not null && _types.TryGetValue(symbol.OriginalDefinition, out var typeNode) ? [typeNode.Id] : [];
                    break;
                }
            }
            if (owners is not null)
            {
                _ownerCache[ancestor] = owners;
                return owners;
            }
        }
        return [];
    }

    private INamedTypeSymbol? OwnerTypeAt(SyntaxNode node, DocInfo doc)
    {
        if (node.Ancestors().OfType<GlobalStatementSyntax>().Any()) return _programType;
        foreach (var type in node.Ancestors().OfType<BaseTypeDeclarationSyntax>())
        {
            var symbol = (doc.Model.GetDeclaredSymbol(type) as INamedTypeSymbol)?.OriginalDefinition;
            while (symbol is not null && !_types.ContainsKey(symbol)) symbol = symbol.ContainingType?.OriginalDefinition;
            if (symbol is not null) return symbol;
        }
        return null;
    }

    private string? TypeId(ITypeSymbol? type) =>
        type is INamedTypeSymbol named && _types.TryGetValue(named.OriginalDefinition, out var node) ? node.Id : null;

    private bool IsTestOwner(string ownerId) => _out.GetNode(ownerId)?.Role?.StartsWith("test", StringComparison.Ordinal) == true;

    private void WalkReferences()
    {
        foreach (var doc in _docs)
        {
            var root = doc.Tree.GetRoot();
            foreach (var node in root.DescendantNodes())
            {
                switch (node)
                {
                    case SimpleNameSyntax name:
                        VisitName(name, doc);
                        break;
                    case ImplicitObjectCreationExpressionSyntax creation:
                        if (TypeId(doc.Model.GetTypeInfo(creation).Type) is { } created)
                            foreach (var owner in OwnersOf(creation, doc)) AddReference(owner, created, "uses", doc, creation);
                        break;
                    case InvocationExpressionSyntax invocation:
                        VisitInvocationFacts(invocation, doc);
                        break;
                    case ElementAccessExpressionSyntax access when access.ArgumentList.Arguments.Count == 1 && IsConfiguration(access.Expression, doc):
                        if (Syntax.StaticString(access.ArgumentList.Arguments[0].Expression, doc.Model) is { } configKey)
                            _configUses.Add((configKey, ConfigOwners(access, doc), doc, access));
                        break;
                }
            }
        }
    }

    private void VisitName(SimpleNameSyntax name, DocInfo doc)
    {
        if (_handlerArguments.Contains(name) || name.Parent is MemberAccessExpressionSyntax { Parent: var p } && _handlerArguments.Contains(name.Parent)) return;
        if (IsInSignature(name)) return;
        var info = doc.Model.GetSymbolInfo(name);
        var symbol = info.Symbol ?? info.CandidateSymbols.FirstOrDefault();
        if (symbol is null) return;
        var owners = OwnersOf(name, doc);
        if (owners.Count == 0) return;

        switch (symbol)
        {
            case INamedTypeSymbol type:
            {
                var target = TypeId(type);
                if (target is null) return;
                var edge = ContextualTypeEdge(name) ?? "uses";
                foreach (var owner in owners) AddReference(owner, target, edge, doc, name);
                break;
            }
            case IMethodSymbol method:
            {
                var definition = (method.ReducedFrom ?? method).OriginalDefinition;
                if (_handlerMethods.TryGetValue(definition, out var endpoints))
                {
                    foreach (var owner in owners)
                        foreach (var endpoint in endpoints)
                            AddReference(owner, endpoint, IsTestOwner(owner) ? "tests" : "calls", doc, name);
                    return;
                }
                var target = TypeId(definition.ContainingType);
                if (target is null) return;
                foreach (var owner in owners)
                {
                    // An endpoint calling a helper of its own class is an implementation detail.
                    if (_out.GetNode(owner)?.Parent == target) continue;
                    AddReference(owner, target, method.MethodKind == MethodKind.Constructor ? "uses" : "calls", doc, name);
                }
                break;
            }
            case IPropertySymbol property:
            {
                var definition = property.OriginalDefinition;
                if (_entityProperties.TryGetValue(definition, out var propertyId))
                {
                    var edge = IsWrite(name) ? "writes" : "reads";
                    foreach (var owner in owners)
                    {
                        // A DbContext mentions properties to configure the mapping and seed data: not data access.
                        if (_out.GetNode(owner)?.Kind == "dbcontext") continue;
                        AddReference(owner, propertyId, edge, doc, name);
                    }
                    return;
                }
                if (property.Type is INamedTypeSymbol { Name: "DbSet", TypeArguments.Length: 1 } set && TypeId(set.TypeArguments[0]) is { } entity
                    && _dbContexts.Contains(property.ContainingType.OriginalDefinition))
                {
                    foreach (var owner in owners)
                    {
                        if (owner == TypeId(property.ContainingType)) continue;
                        AddReference(owner, entity, "queries", doc, name);
                    }
                    return;
                }
                if (TypeId(property.ContainingType) is { } container)
                    foreach (var owner in owners) AddReference(owner, container, "uses", doc, name);
                break;
            }
            case IFieldSymbol or IEventSymbol:
            {
                if (TypeId(symbol.ContainingType) is { } container)
                    foreach (var owner in owners) AddReference(owner, container, "uses", doc, name);
                break;
            }
        }
    }

    /// <summary>Constructor/handler parameters and handler return types are handled by EmitSignatureEdges.</summary>
    private static bool IsInSignature(SyntaxNode name)
    {
        foreach (var ancestor in name.Ancestors())
        {
            switch (ancestor)
            {
                case ParameterListSyntax list:
                    return list.Parent is ConstructorDeclarationSyntax or TypeDeclarationSyntax;
                case BlockSyntax or ArrowExpressionClauseSyntax or MemberDeclarationSyntax or StatementSyntax:
                    return false;
            }
        }
        return false;
    }

    /// <summary>AddScoped&lt;T&gt; → registers, GetRequiredService&lt;T&gt; → resolves.</summary>
    private static string? ContextualTypeEdge(SyntaxNode name)
    {
        foreach (var ancestor in name.Ancestors())
        {
            if (ancestor is GenericNameSyntax generic && generic.TypeArgumentList.Span.Contains(name.Span))
            {
                var method = generic.Identifier.Text;
                if (DiMethods.ContainsKey(method)) return "registers";
                if (ResolveMethods.Contains(method)) return "resolves";
                return null;
            }
            if (ancestor is TypeOfExpressionSyntax && ancestor.Parent is ArgumentSyntax { Parent.Parent: InvocationExpressionSyntax invocation }
                && DiMethods.ContainsKey(Syntax.MethodName(invocation)))
                return "registers";
            if (ancestor is StatementSyntax or MemberDeclarationSyntax) return null;
        }
        return null;
    }

    private static bool IsWrite(SimpleNameSyntax name)
    {
        SyntaxNode node = name.Parent is MemberAccessExpressionSyntax member && member.Name == name ? member : name;
        return node.Parent switch
        {
            AssignmentExpressionSyntax assignment => assignment.Left == node,
            PrefixUnaryExpressionSyntax or PostfixUnaryExpressionSyntax => true,
            _ => false,
        };
    }

    private void AddReference(string owner, string target, string edge, DocInfo doc, SyntaxNode at)
    {
        if (owner == target) return;
        // An endpoint using constants/helpers of the class that maps it is an implementation detail.
        if (edge is not "tests" && _out.GetNode(owner) is { Kind: "endpoint" } endpoint && endpoint.Parent == target) return;
        if (IsTestOwner(owner))
        {
            if (edge is not "tests") edge = IsSubjectOf(owner, target) ? "tests" : "uses";
        }
        // A DbContext lists every entity (DbSet<T>); following that in a trace would reach the whole
        // data model. Traces use the precise queries/reads/writes edges instead.
        else if (edge == "uses" && _out.GetNode(owner)?.Kind == "dbcontext" && _out.GetNode(target)?.Kind == "entity")
        {
            edge = "exposes";
        }
        _out.AddEdge(owner, target, edge, Syntax.Evidence(doc.File.Path, at));
    }

    /// <summary>FooTests tests Foo (and FooEndpointTests tests FooEndpoints).</summary>
    private bool IsSubjectOf(string testId, string targetId)
    {
        var test = _out.GetNode(testId)?.Label;
        var target = _out.GetNode(targetId)?.Label;
        if (test is null || target is null) return false;
        var subject = test.EndsWith("Tests", StringComparison.Ordinal) ? test[..^5] : test.EndsWith("Test", StringComparison.Ordinal) ? test[..^4] : null;
        return subject is { Length: > 2 } && target.StartsWith(subject, StringComparison.Ordinal);
    }

    private void VisitInvocationFacts(InvocationExpressionSyntax invocation, DocInfo doc)
    {
        var name = Syntax.MethodName(invocation);
        var arguments = invocation.ArgumentList.Arguments;
        if (arguments.Count == 0) return;

        // HTTP requests (typically integration tests through HttpClient).
        if (HttpClientMethods.TryGetValue(name, out var httpMethod) && Syntax.StaticString(arguments[0].Expression, doc.Model) is { } url && LooksLikeLocalUrl(url))
        {
            foreach (var owner in OwnersOf(invocation, doc))
            {
                _out.Facts.Add(new Fact
                {
                    Type = "http", From = owner, EdgeType = IsTestOwner(owner) ? "tests" : "http", Method = httpMethod, Url = url,
                    Evidence = [Syntax.Evidence(doc.File.Path, invocation)],
                });
            }
            return;
        }
        // Redirects to app pages.
        if (name is "Redirect" or "RedirectPermanent" or "LocalRedirect" && Syntax.StaticString(arguments[0].Expression, doc.Model) is { } target && target.StartsWith('/'))
        {
            foreach (var owner in OwnersOf(invocation, doc))
            {
                _out.Facts.Add(new Fact
                {
                    Type = "navigate", From = owner, EdgeType = IsTestOwner(owner) ? "tests" : "navigates", Url = target,
                    Evidence = [Syntax.Evidence(doc.File.Path, invocation)],
                });
            }
            return;
        }
        // Configuration keys.
        if (name is "GetSection" or "GetRequiredSection" or "GetConnectionString" or "GetValue" or "BindConfiguration"
            && Syntax.StaticString(arguments[0].Expression, doc.Model) is { } key)
        {
            var fullKey = name == "GetConnectionString" ? $"ConnectionStrings:{key}" : key;
            _configUses.Add((fullKey, ConfigOwners(invocation, doc), doc, invocation));
        }
    }

    private static bool LooksLikeLocalUrl(string url) =>
        url.StartsWith('/') || url.StartsWith("{", StringComparison.Ordinal) || url.StartsWith("http://localhost", StringComparison.OrdinalIgnoreCase);

    private static bool IsConfiguration(ExpressionSyntax expression, DocInfo doc)
    {
        var type = doc.Model.GetTypeInfo(expression).Type;
        return type is not null && (type.Name is "IConfiguration" or "ConfigurationManager" or "IConfigurationSection" || type.AllInterfaces.Any(i => i.Name == "IConfiguration"));
    }

    /// <summary>Config read inside Configure&lt;T&gt;(…)/AddDbContext&lt;T&gt;(…) belongs to T; otherwise to the enclosing owner.</summary>
    private List<string> ConfigOwners(SyntaxNode node, DocInfo doc)
    {
        foreach (var invocation in node.Ancestors().OfType<InvocationExpressionSyntax>())
        {
            var name = Syntax.MethodName(invocation);
            if (name is not ("Configure" or "AddOptions" or "AddDbContext" or "AddDbContextPool" or "AddDbContextFactory" or "Bind")) continue;
            var type = GenericArguments(invocation).Select(t => doc.Model.GetTypeInfo(t).Type).FirstOrDefault();
            if (TypeId(type) is { } id) return [id];
        }
        return OwnersOf(node, doc);
    }

    // ------------------------------------------------------------------ signatures

    private void EmitSignatureEdges()
    {
        foreach (var (symbol, node) in _types)
        {
            var isTest = node.Role?.StartsWith("test", StringComparison.Ordinal) == true;
            foreach (var constructor in symbol.InstanceConstructors)
            {
                foreach (var parameter in constructor.Parameters)
                {
                    foreach (var type in Syntax.Unwrap(parameter.Type))
                    {
                        if (TypeId(type) is not { } target) continue;
                        var edge = isTest ? "uses" : symbol.IsRecord ? "uses" : "injects";
                        var at = parameter.DeclaringSyntaxReferences.FirstOrDefault()?.GetSyntax() ?? node.Declaration;
                        AddReference(node.Id, target, edge, node.Doc, at);
                    }
                }
            }
        }
        foreach (var endpoint in _endpoints.Values)
        {
            var method = HandlerSymbol(endpoint);
            if (method is null) continue;
            foreach (var parameter in method.Parameters)
            {
                foreach (var type in Syntax.Unwrap(parameter.Type))
                {
                    if (TypeId(type) is not { } target) continue;
                    var kind = _out.GetNode(target)?.Kind;
                    AddReference(endpoint.Id, target, kind is "dto" ? "uses" : "injects", endpoint.Doc, endpoint.MappedAt);
                }
            }
            foreach (var type in Syntax.Unwrap(method.ReturnType))
            {
                if (TypeId(type) is { } target) AddReference(endpoint.Id, target, "returns", endpoint.Doc, endpoint.MappedAt);
            }
        }
    }

    // ------------------------------------------------------------------ configuration files

    private void EmitConfigurationEdges()
    {
        var settingsFiles = _files.Values
            .Where(f => Path.GetFileName(f.Path).StartsWith("appsettings", StringComparison.OrdinalIgnoreCase) && f.Path.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
            .Select(f => (Entry: f, Json: TryParseJson(FullPath(f.Path))))
            .Where(f => f.Json is not null)
            .ToList();
        foreach (var (key, owners, doc, at) in _configUses)
        {
            foreach (var (entry, json) in settingsFiles)
            {
                var dir = Path.GetDirectoryName(entry.Path)!.Replace('\\', '/');
                if (doc.ProjectDir.Length > 0 && dir != doc.ProjectDir) continue;
                if (!HasPath(json!.RootElement, key)) continue;
                foreach (var owner in owners)
                    _out.AddEdge($"{entry.Layer}:file:{entry.Path}", owner, "configures", Syntax.Evidence(doc.File.Path, at), 1, new() { ["key"] = key });
            }
        }
    }

    private static JsonDocument? TryParseJson(string path)
    {
        try
        {
            return JsonDocument.Parse(File.ReadAllText(path), new JsonDocumentOptions { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip });
        }
        catch (Exception ex) when (ex is IOException or JsonException)
        {
            return null;
        }
    }

    private static bool HasPath(JsonElement root, string key)
    {
        var current = root;
        foreach (var part in key.Split(':'))
        {
            if (current.ValueKind != JsonValueKind.Object) return false;
            var match = current.EnumerateObject().FirstOrDefault(p => string.Equals(p.Name, part, StringComparison.OrdinalIgnoreCase));
            if (match.Value.ValueKind == JsonValueKind.Undefined) return false;
            current = match.Value;
        }
        return true;
    }
}
