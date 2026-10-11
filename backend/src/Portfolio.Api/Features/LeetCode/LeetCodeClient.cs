using System.Text.Json.Nodes;

namespace Portfolio.Api.Features.LeetCode;

public interface ILeetCodeClient
{
    /// <summary>
    /// Asks LeetCode for the user's solved counts. Null when there's no such user.
    /// Throws when LeetCode can't be reached or answers with something unexpected.
    /// </summary>
    Task<LeetCodeStats?> FetchAsync(string username, CancellationToken cancellationToken);
}

/// <summary>
/// Reads the public stats LeetCode's own profile page shows, from its GraphQL endpoint.
/// It isn't an official API: it needs no key, but LeetCode may change it at any time.
/// </summary>
public class LeetCodeClient(HttpClient http, TimeProvider time) : ILeetCodeClient
{
    public static readonly Uri BaseAddress = new("https://leetcode.com/");

    private const string Query = """
        query stats($username: String!) {
          allQuestionsCount { difficulty count }
          matchedUser(username: $username) { username submitStatsGlobal { acSubmissionNum { difficulty count } } }
        }
        """;

    public async Task<LeetCodeStats?> FetchAsync(string username, CancellationToken cancellationToken)
    {
        using var response = await http.PostAsJsonAsync("graphql", new { query = Query, variables = new { username } }, cancellationToken);
        response.EnsureSuccessStatusCode();
        return Parse(await response.Content.ReadAsStringAsync(cancellationToken), time.GetUtcNow());
    }

    /// <summary>Reads LeetCode's answer to <see cref="Query"/>. Null when there's no such user.</summary>
    /// <exception cref="InvalidDataException">The answer isn't shaped as expected.</exception>
    public static LeetCodeStats? Parse(string json, DateTimeOffset fetchedAt)
    {
        var data = JsonNode.Parse(json)?["data"] ?? throw new InvalidDataException("LeetCode answered without data.");
        var total = Counts(data["allQuestionsCount"]);
        if (data["matchedUser"] is not JsonObject user) return null;

        var name = user["username"]?.GetValue<string>() ?? throw new InvalidDataException("LeetCode answered without a username.");
        return new LeetCodeStats(name, Counts(user["submitStatsGlobal"]?["acSubmissionNum"]), total, fetchedAt);
    }

    /// <summary>[{ "difficulty": "Easy", "count": 3 }, …] → counts.</summary>
    private static DifficultyCounts Counts(JsonNode? node)
    {
        if (node is not JsonArray array) throw new InvalidDataException("LeetCode answered without counts.");
        int Count(string difficulty) =>
            array.FirstOrDefault(n => n?["difficulty"]?.GetValue<string>() == difficulty)?["count"]?.GetValue<int>()
            ?? throw new InvalidDataException($"LeetCode answered without a count for {difficulty}.");
        int easy = Count("Easy"), medium = Count("Medium"), hard = Count("Hard");
        return new DifficultyCounts(easy + medium + hard, easy, medium, hard);
    }
}
