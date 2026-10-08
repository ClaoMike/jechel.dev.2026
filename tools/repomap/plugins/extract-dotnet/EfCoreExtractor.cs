using System.Globalization;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace RepoMap.DotNet;

/// <summary>
/// The database layer from EF Core artefacts, without building or connecting to anything:
/// - the model snapshot (*ModelSnapshot.cs) → tables, columns, keys, foreign keys, seed data, and the
///   entity → table / property → column mapping
/// - migrations (Up methods) → which tables/columns each migration touched
/// Syntax-only, so it works on any EF Core provider and doesn't need the project to compile.
/// </summary>
public static class EfCoreExtractor
{
    private sealed class EntityModel
    {
        public required string Name;
        public string? Table;
        public string? Schema;
        public string? BaseType;
        public int Line;
        public int SeedRows;
        public readonly List<ColumnModel> Columns = [];
        public readonly List<string> Key = [];
        public readonly List<string> Indexes = [];
        public readonly List<ForeignKeyModel> ForeignKeys = [];
    }

    private sealed class ColumnModel
    {
        public required string Property;
        public string? Column;
        public string? ClrType;
        public string? StoreType;
        public bool Required;
        public int? MaxLength;
        public bool Generated;
        public bool Identity;
        public string? Default;
    }

    private sealed record ForeignKeyModel(string Principal, List<string> Properties, List<string>? PrincipalKey, string? OnDelete, string? Navigation);

    private sealed record MigrationOp(string Operation, string Table, string? Column, string? Schema);

    public static PluginOutput Run(PluginRequest request)
    {
        var output = new OutputBuilder();
        var codeLayer = request.Plugin.Option("codeLayer") ?? "backend";
        var dbLayer = request.Plugin.Option("databaseLayer") ?? "database";
        var parse = new CSharpParseOptions(LanguageVersion.Preview);

        var trees = request.Files
            .Where(f => f.Path.EndsWith(".cs", StringComparison.Ordinal))
            .Select(f => (File: f, Text: SafeRead(Path.Combine(request.RepoRoot, f.Path))))
            .Where(f => f.Text is not null && (f.Text.Contains("ModelSnapshot") || f.Text.Contains(": Migration") || f.Text.Contains("[Migration(")))
            .Select(f => (f.File, Root: CSharpSyntaxTree.ParseText(f.Text!, parse).GetCompilationUnitRoot()))
            .ToList();

        // ---- Model snapshot → tables and columns
        var entities = new Dictionary<string, EntityModel>(StringComparer.Ordinal);
        string? snapshotFile = null;
        foreach (var (file, root) in trees)
        {
            foreach (var type in root.DescendantNodes().OfType<ClassDeclarationSyntax>().Where(c => HasBase(c, "ModelSnapshot")))
            {
                snapshotFile = file.Path;
                output.Claims.Add(file.Path);
                var defaultSchema = request.Plugin.Option("defaultSchema") ?? GuessSchema(root);
                var ns = Namespace(type);
                var build = type.Members.OfType<MethodDeclarationSyntax>().FirstOrDefault(m => m.Identifier.Text == "BuildModel");
                if (build?.Body is not null) ParseModel(build.Body, entities, defaultSchema);
                var version = build?.DescendantNodes().OfType<InvocationExpressionSyntax>()
                    .Where(i => Syntax.MethodName(i) == "HasAnnotation" && i.ArgumentList.Arguments.Count == 2 && Syntax.StaticString(i.ArgumentList.Arguments[0].Expression, null) == "ProductVersion")
                    .Select(i => Syntax.StaticString(i.ArgumentList.Arguments[1].Expression, null))
                    .FirstOrDefault();
                output.AddNode(new OutNode
                {
                    Id = $"{file.Layer}:class:{ns}{type.Identifier.Text}",
                    Label = type.Identifier.Text,
                    Kind = "snapshot",
                    File = file.Path,
                    Line = Syntax.Line(type),
                    Attrs = version is null ? null : new() { ["efCoreVersion"] = version },
                    Description = "EF Core's snapshot of the current model, used to compute the next migration (generated).",
                    DescriptionSource = "derived",
                });
            }
        }

        // Inheritance without its own table (TPH): columns live in the base entity's table.
        foreach (var entity in entities.Values)
        {
            if (entity.Table is null && entity.BaseType is not null && entities.TryGetValue(entity.BaseType, out var baseEntity))
            {
                entity.Table = baseEntity.Table;
                entity.Schema = baseEntity.Schema;
            }
            entity.Table ??= entity.Name.Split('.', '+').Last();
        }

        string TableId(EntityModel e) => $"{dbLayer}:table:{Qualified(e.Schema, e.Table!)}";
        string ColumnId(EntityModel e, ColumnModel c) => $"{dbLayer}:column:{Qualified(e.Schema, e.Table!)}.{c.Column ?? c.Property}";

        foreach (var entity in entities.Values)
        {
            var tableId = TableId(entity);
            var isClrType = entity.Name.Contains('.');
            var existing = output.GetNode(tableId);
            if (existing is null)
            {
                var attrs = new Dictionary<string, object?>();
                if (entity.Schema is not null) attrs["schema"] = entity.Schema;
                if (isClrType) attrs["entity"] = entity.Name;
                if (entity.Key.Count > 0) attrs["primaryKey"] = entity.Key.Select(k => ColumnOf(entity, k)).ToList();
                if (entity.SeedRows > 0) attrs["seedRows"] = entity.SeedRows;
                if (entity.Indexes.Count > 0) attrs["indexes"] = entity.Indexes;
                output.AddNode(new OutNode
                {
                    Id = tableId,
                    Label = entity.Table!,
                    Kind = "table",
                    Layer = dbLayer,
                    Role = "production",
                    RoleReason = "table in the EF Core model",
                    File = snapshotFile,
                    Line = entity.Line,
                    Attrs = attrs,
                });
            }
            if (isClrType) output.AddEdge($"{codeLayer}:class:{entity.Name}", tableId, "maps-to");

            foreach (var column in entity.Columns)
            {
                var columnId = ColumnId(entity, column);
                var attrs = new Dictionary<string, object?>
                {
                    ["type"] = column.StoreType ?? column.ClrType,
                    ["nullable"] = !column.Required,
                };
                if (column.MaxLength is not null) attrs["maxLength"] = column.MaxLength;
                if (entity.Key.Contains(column.Property)) attrs["primaryKey"] = true;
                if (column.Identity) attrs["identity"] = true;
                else if (column.Generated) attrs["generated"] = true;
                if (column.Default is not null) attrs["default"] = column.Default;
                output.AddNode(new OutNode
                {
                    Id = columnId,
                    Label = $"{entity.Table}.{column.Column ?? column.Property}",
                    Kind = "column",
                    Layer = dbLayer,
                    Role = "production",
                    RoleReason = "column in the EF Core model",
                    Parent = tableId,
                    File = snapshotFile,
                    Line = entity.Line,
                    Attrs = attrs,
                });
                if (isClrType) output.AddEdge($"{codeLayer}:property:{entity.Name}.{column.Property}", columnId, "maps-to");
            }
        }

        // Foreign keys: dependent column → principal key column.
        foreach (var entity in entities.Values)
        {
            foreach (var fk in entity.ForeignKeys)
            {
                if (!entities.TryGetValue(fk.Principal, out var principal)) continue;
                var principalKey = fk.PrincipalKey ?? principal.Key;
                for (var i = 0; i < fk.Properties.Count && i < principalKey.Count; i++)
                {
                    var from = entity.Columns.FirstOrDefault(c => c.Property == fk.Properties[i]);
                    var to = principal.Columns.FirstOrDefault(c => c.Property == principalKey[i]);
                    if (from is null || to is null) continue;
                    var attrs = new Dictionary<string, object?> { ["principal"] = principal.Table };
                    if (fk.OnDelete is not null) attrs["onDelete"] = fk.OnDelete;
                    if (fk.Navigation is not null) attrs["navigation"] = fk.Navigation;
                    output.AddEdge(ColumnId(entity, from), ColumnId(principal, to), "foreign-key", attrs: attrs);
                }
            }
        }

        // ---- Migrations → what they changed
        // Migrations usually omit the schema; index tables both with and without it.
        var tables = new Dictionary<string, EntityModel>(StringComparer.OrdinalIgnoreCase);
        // Base entities first, so a table shared by an inheritance hierarchy resolves to its root.
        foreach (var entity in entities.Values.OrderBy(e => e.BaseType is null ? 0 : 1))
        {
            tables.TryAdd(Qualified(entity.Schema, entity.Table!), entity);
            tables.TryAdd(entity.Table!, entity);
        }
        var migrations = new List<(string Id, string MigrationId, FileEntry File, int Line, List<MigrationOp> Ops)>();
        foreach (var (file, root) in trees)
        {
            foreach (var type in root.DescendantNodes().OfType<ClassDeclarationSyntax>())
            {
                var migrationAttribute = type.AttributeLists.SelectMany(l => l.Attributes).FirstOrDefault(a => a.Name.ToString() is "Migration" or "MigrationAttribute");
                var isMigration = HasBase(type, "Migration") || migrationAttribute is not null;
                if (!isMigration) continue;
                output.Claims.Add(file.Path);
                var id = $"{file.Layer}:class:{Namespace(type)}{type.Identifier.Text}";
                var up = type.Members.OfType<MethodDeclarationSyntax>().FirstOrDefault(m => m.Identifier.Text == "Up");
                var index = migrations.FindIndex(m => m.Id == id);
                var migrationId = migrationAttribute?.ArgumentList?.Arguments.FirstOrDefault() is { } arg ? Syntax.StaticString(arg.Expression, null) : null;
                if (index < 0)
                {
                    migrations.Add((id, migrationId ?? Path.GetFileNameWithoutExtension(file.Path).Replace(".Designer", ""), file, Syntax.Line(type), []));
                    index = migrations.Count - 1;
                }
                else if (migrationId is not null)
                {
                    migrations[index] = migrations[index] with { MigrationId = migrationId };
                }
                if (up?.Body is not null)
                {
                    migrations[index] = migrations[index] with { File = file, Line = Syntax.Line(type) };
                    migrations[index].Ops.AddRange(ParseMigration(up.Body));
                }
            }
        }
        var ordered = migrations.OrderBy(m => m.MigrationId, StringComparer.Ordinal).ToList();
        for (var i = 0; i < ordered.Count; i++)
        {
            var migration = ordered[i];
            var summary = migration.Ops.Select(o => o.Column is null ? $"{o.Operation} {o.Table}" : $"{o.Operation} {o.Table}.{o.Column}").Distinct().ToList();
            output.AddNode(new OutNode
            {
                Id = migration.Id,
                Label = migration.Id.Split('.').Last(),
                Kind = "migration",
                File = migration.File.Path,
                Line = migration.Line,
                Attrs = new()
                {
                    ["migrationId"] = migration.MigrationId,
                    ["created"] = CreatedAt(migration.MigrationId),
                    ["order"] = i + 1,
                    ["operations"] = summary,
                },
                Description = summary.Count > 0 ? string.Join("; ", summary.Take(6)) : null,
                DescriptionSource = summary.Count > 0 ? "derived" : null,
            });
            foreach (var group in migration.Ops.GroupBy(o => (Qualified(o.Schema, o.Table), o.Column)))
            {
                if (!tables.TryGetValue(group.Key.Item1, out var entity)) continue;
                var ops = group.Select(o => o.Operation).Distinct().ToList();
                var column = group.Key.Column is null ? null : entity.Columns.FirstOrDefault(c => string.Equals(c.Column ?? c.Property, group.Key.Column, StringComparison.OrdinalIgnoreCase));
                var target = column is null ? TableId(entity) : ColumnId(entity, column);
                output.AddEdge(migration.Id, target, "migrates", attrs: new() { ["operations"] = ops });
            }
        }

        Console.Error.WriteLine($"efcore: {entities.Count} entities, {ordered.Count} migrations");
        return output.Build();
    }

    // ------------------------------------------------------------------ snapshot

    private static void ParseModel(BlockSyntax body, Dictionary<string, EntityModel> entities, string? defaultSchema)
    {
        foreach (var statement in body.Statements.OfType<ExpressionStatementSyntax>())
        {
            if (statement.Expression is not InvocationExpressionSyntax invocation) continue;
            var chain = Flatten(invocation);
            if (chain.Count > 0 && chain[0].Name == "HasDefaultSchema" && chain[0].Args.Count > 0)
                defaultSchema = Syntax.StaticString(chain[0].Args[0].Expression, null) ?? defaultSchema;
        }
        foreach (var invocation in body.DescendantNodes().OfType<InvocationExpressionSyntax>())
        {
            if (Syntax.MethodName(invocation) != "Entity" || invocation.Expression is not MemberAccessExpressionSyntax { Expression: IdentifierNameSyntax { Identifier.Text: "modelBuilder" } }) continue;
            var arguments = invocation.ArgumentList.Arguments;
            if (arguments.Count < 2 || Syntax.StaticString(arguments[0].Expression, null) is not { } name) continue;
            if (arguments[1].Expression is not SimpleLambdaExpressionSyntax { Block: { } block } lambda) continue;
            if (!entities.TryGetValue(name, out var entity))
                entities[name] = entity = new EntityModel { Name = name, Line = Syntax.Line(invocation), Schema = defaultSchema };
            ParseEntity(block, lambda.Parameter.Identifier.Text, entity, entities, defaultSchema);
        }
    }

    private static void ParseEntity(BlockSyntax block, string builder, EntityModel entity, Dictionary<string, EntityModel> entities, string? defaultSchema)
    {
        foreach (var statement in block.Statements.OfType<ExpressionStatementSyntax>())
        {
            if (statement.Expression is not InvocationExpressionSyntax invocation) continue;
            // Npgsql/SqlServer extension calls wrap a property: UseIdentityByDefaultColumn(b.Property<int>("Id"))
            if (invocation.ArgumentList.Arguments.FirstOrDefault()?.Expression is InvocationExpressionSyntax inner && Syntax.MethodName(invocation).StartsWith("UseIdentity", StringComparison.Ordinal))
            {
                var innerChain = Flatten(inner);
                if (innerChain.Count > 0 && innerChain[0].Name == "Property" && Arg(innerChain[0], 0) is { } identityProperty)
                    Column(entity, identityProperty).Identity = true;
                continue;
            }
            var chain = Flatten(invocation);
            if (chain.Count == 0 || chain[0].Receiver != builder) continue;
            var head = chain[0];
            switch (head.Name)
            {
                case "Property" when Arg(head, 0) is { } property:
                {
                    var column = Column(entity, property);
                    column.ClrType = head.TypeArgs.FirstOrDefault();
                    if (column.ClrType is { } clr && (clr.EndsWith('?') || clr == "string" || clr == "byte[]")) column.Required = false;
                    else if (column.ClrType is not null) column.Required = true;
                    foreach (var call in chain.Skip(1))
                    {
                        switch (call.Name)
                        {
                            case "HasColumnName": column.Column = Arg(call, 0); break;
                            case "HasColumnType": column.StoreType = Arg(call, 0); break;
                            case "IsRequired": column.Required = call.Args.Count == 0 || call.Args[0].Expression.ToString() == "true"; break;
                            case "HasMaxLength": column.MaxLength = int.TryParse(call.Args.FirstOrDefault()?.Expression.ToString(), out var max) ? max : null; break;
                            case "ValueGeneratedOnAdd" or "ValueGeneratedOnAddOrUpdate": column.Generated = true; break;
                            case "HasDefaultValueSql" or "HasDefaultValue": column.Default = call.Args.FirstOrDefault()?.Expression.ToString(); break;
                        }
                    }
                    break;
                }
                case "HasKey":
                    entity.Key.Clear();
                    entity.Key.AddRange(head.Args.Select(a => Syntax.StaticString(a.Expression, null)).OfType<string>());
                    break;
                case "HasIndex":
                {
                    var columns = head.Args.Select(a => Syntax.StaticString(a.Expression, null)).OfType<string>().ToList();
                    var unique = chain.Any(c => c.Name == "IsUnique");
                    entity.Indexes.Add($"{(unique ? "unique " : "")}({string.Join(", ", columns)})");
                    break;
                }
                case "ToTable":
                    entity.Table = Arg(head, 0);
                    if (head.Args.Count > 1 && Syntax.StaticString(head.Args[1].Expression, null) is { } schema) entity.Schema = schema;
                    break;
                case "HasBaseType":
                    entity.BaseType = Arg(head, 0);
                    break;
                case "HasData":
                    entity.SeedRows += head.Args.Count;
                    break;
                case "HasOne" when Arg(head, 0) is { } principal:
                {
                    var navigation = head.Args.Count > 1 ? Syntax.StaticString(head.Args[1].Expression, null) : null;
                    var fkCall = chain.FirstOrDefault(c => c.Name == "HasForeignKey");
                    if (fkCall is null) break;
                    // One-to-one: HasForeignKey("Dependent.Type", "Prop") names the dependent entity first.
                    var fkArgs = fkCall.Args.Select(a => Syntax.StaticString(a.Expression, null)).OfType<string>().ToList();
                    var dependent = entity;
                    if (fkArgs.Count > 1 && fkArgs[0].Contains('.') && entities.TryGetValue(fkArgs[0], out var named))
                    {
                        dependent = named;
                        fkArgs = fkArgs.Skip(1).ToList();
                        // …and then the principal is the entity whose block we're in.
                        principal = entity.Name;
                    }
                    var principalKey = chain.FirstOrDefault(c => c.Name == "HasPrincipalKey")?.Args.Select(a => Syntax.StaticString(a.Expression, null)).OfType<string>().ToList();
                    var onDelete = chain.FirstOrDefault(c => c.Name == "OnDelete")?.Args.FirstOrDefault()?.Expression.ToString().Split('.').Last();
                    dependent.ForeignKeys.Add(new ForeignKeyModel(principal, fkArgs, principalKey is { Count: > 0 } ? principalKey : null, onDelete, navigation));
                    break;
                }
                case "OwnsOne" or "OwnsMany" when head.Args.Count >= 3 && head.Args[^1].Expression is SimpleLambdaExpressionSyntax { Block: { } ownedBlock } ownedLambda:
                {
                    // Owned types share the owner's table unless they map their own.
                    var ownedName = Arg(head, 0) ?? $"{entity.Name}.{Arg(head, 1)}";
                    var owned = new EntityModel { Name = ownedName, Line = Syntax.Line(invocation), Schema = entity.Schema, BaseType = entity.Name };
                    entities[ownedName] = owned;
                    ParseEntity(ownedBlock, ownedLambda.Parameter.Identifier.Text, owned, entities, defaultSchema);
                    break;
                }
            }
        }
    }

    private static ColumnModel Column(EntityModel entity, string property)
    {
        var column = entity.Columns.FirstOrDefault(c => c.Property == property);
        if (column is null) entity.Columns.Add(column = new ColumnModel { Property = property });
        return column;
    }

    private static string ColumnOf(EntityModel entity, string property) =>
        entity.Columns.FirstOrDefault(c => c.Property == property)?.Column ?? property;

    // ------------------------------------------------------------------ migrations

    private static IEnumerable<MigrationOp> ParseMigration(BlockSyntax up)
    {
        foreach (var invocation in up.DescendantNodes().OfType<InvocationExpressionSyntax>())
        {
            if (invocation.Expression is not MemberAccessExpressionSyntax { Expression: IdentifierNameSyntax { Identifier.Text: "migrationBuilder" } }) continue;
            var name = Syntax.MethodName(invocation);
            string? Named(string argument) => invocation.ArgumentList.Arguments
                .FirstOrDefault(a => a.NameColon?.Name.Identifier.Text == argument) is { } arg
                ? Syntax.StaticString(arg.Expression, null)
                : null;
            var schema = Named("schema");
            switch (name)
            {
                case "CreateTable":
                {
                    var table = Named("name");
                    if (table is null) break;
                    yield return new MigrationOp("create table", table, null, schema);
                    break;
                }
                case "DropTable" or "RenameTable":
                    if (Named("name") is { } dropped) yield return new MigrationOp(name == "DropTable" ? "drop table" : "rename table", Named("newName") ?? dropped, null, schema);
                    break;
                case "AddColumn" or "AlterColumn" or "DropColumn" or "RenameColumn":
                {
                    var table = Named("table");
                    var column = name == "RenameColumn" ? Named("newName") : Named("name");
                    if (table is null) break;
                    var operation = name switch { "AddColumn" => "add column", "AlterColumn" => "alter column", "DropColumn" => "drop column", _ => "rename column" };
                    yield return new MigrationOp(operation, table, column, schema);
                    break;
                }
                case "CreateIndex" or "DropIndex" or "AddForeignKey" or "DropForeignKey" or "AddPrimaryKey" or "DropPrimaryKey" or "AddUniqueConstraint" or "DropUniqueConstraint":
                {
                    if (Named("table") is { } table)
                        yield return new MigrationOp(string.Concat(name.Select((c, i) => i > 0 && char.IsUpper(c) ? $" {char.ToLowerInvariant(c)}" : char.ToLowerInvariant(c).ToString())), table, null, schema);
                    break;
                }
                case "InsertData" or "UpdateData" or "DeleteData":
                {
                    if (Named("table") is { } table)
                        yield return new MigrationOp(name.Replace("Data", " data").ToLowerInvariant(), table, null, schema);
                    break;
                }
            }
        }
    }

    // ------------------------------------------------------------------ helpers

    private sealed record Call(string Name, string? Receiver, List<ArgumentSyntax> Args, List<string> TypeArgs);

    /// <summary>b.Property&lt;int&gt;("Id").HasColumnName("id") → [Property(b), HasColumnName] (innermost first).</summary>
    private static List<Call> Flatten(InvocationExpressionSyntax invocation)
    {
        var calls = new List<Call>();
        ExpressionSyntax? current = invocation;
        while (current is InvocationExpressionSyntax call && call.Expression is MemberAccessExpressionSyntax member)
        {
            var typeArgs = member.Name is GenericNameSyntax generic ? generic.TypeArgumentList.Arguments.Select(t => t.ToString()).ToList() : [];
            var receiver = member.Expression is IdentifierNameSyntax identifier ? identifier.Identifier.Text : null;
            calls.Add(new Call(member.Name.Identifier.Text, receiver, [.. call.ArgumentList.Arguments], typeArgs));
            current = member.Expression;
        }
        calls.Reverse();
        return calls;
    }

    private static string? Arg(Call call, int index) =>
        index < call.Args.Count ? Syntax.StaticString(call.Args[index].Expression, null) : null;

    private static bool HasBase(ClassDeclarationSyntax type, string name) =>
        type.BaseList?.Types.Any(t => t.Type.ToString().Split('.').Last() == name) == true;

    private static string Namespace(SyntaxNode node)
    {
        var ns = node.Ancestors().OfType<BaseNamespaceDeclarationSyntax>().FirstOrDefault();
        return ns is null ? "" : $"{ns.Name}.";
    }

    private static string? GuessSchema(CompilationUnitSyntax root)
    {
        var usings = string.Join(' ', root.Usings.Select(u => u.Name?.ToString()));
        if (usings.Contains("Npgsql", StringComparison.Ordinal)) return "public";
        if (usings.Contains("SqlServer", StringComparison.Ordinal)) return "dbo";
        return null;
    }

    private static string Qualified(string? schema, string table) => schema is null ? table : $"{schema}.{table}";

    private static string? CreatedAt(string migrationId)
    {
        var stamp = migrationId.Split('_')[0];
        return DateTime.TryParseExact(stamp, "yyyyMMddHHmmss", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var created)
            ? created.ToString("yyyy-MM-dd HH:mm 'UTC'", CultureInfo.InvariantCulture)
            : null;
    }

    private static string? SafeRead(string path)
    {
        try
        {
            return File.ReadAllText(path);
        }
        catch (IOException)
        {
            return null;
        }
    }
}
