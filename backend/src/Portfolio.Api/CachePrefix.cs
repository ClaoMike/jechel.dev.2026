using Npgsql;

namespace Portfolio.Api;

/// <summary>The prefix of the API's keys in Redis: "portfolio:{database}:", so APIs on different databases sharing one Redis keep apart.</summary>
public static class CachePrefix
{
    public static string For(string? connectionString)
    {
        var database = "default";
        try
        {
            if (new NpgsqlConnectionStringBuilder(connectionString ?? "").Database is { Length: > 0 } name) database = name;
        }
        catch (ArgumentException)
        {
        }
        return $"portfolio:{database}:";
    }
}
