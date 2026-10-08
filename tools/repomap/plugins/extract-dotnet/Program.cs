using System.Text.Json;
using RepoMap.DotNet;

// repomap .NET plugin: JSON request on stdin → JSON output on stdout, logs on stderr.
var mode = args.Length > 0 ? args[0] : "code";
try
{
    var input = await Console.In.ReadToEndAsync();
    var request = JsonSerializer.Deserialize<PluginRequest>(input, Json.Options)
        ?? throw new InvalidOperationException("Empty request on stdin.");
    var output = mode switch
    {
        "code" => await CodeExtractor.RunAsync(request),
        "efcore" => EfCoreExtractor.Run(request),
        _ => throw new ArgumentException($"Unknown mode '{mode}'. Use 'code' or 'efcore'."),
    };
    await using var stdout = Console.OpenStandardOutput();
    await JsonSerializer.SerializeAsync(stdout, output, Json.Options);
    return 0;
}
catch (Exception ex)
{
    Console.Error.WriteLine(ex);
    return 1;
}
