using Portfolio.Api.Features.LeetCode;

namespace Portfolio.Api.UnitTests.Features.LeetCode;

public class LeetCodeClientTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 11, 12, 0, 0, TimeSpan.Zero);

    // Shaped like LeetCode's real answers (October 2026).
    private const string Found = """
        {"data":{"allQuestionsCount":[{"difficulty":"All","count":4073},{"difficulty":"Easy","count":969},{"difficulty":"Medium","count":2124},{"difficulty":"Hard","count":980}],
        "matchedUser":{"username":"NeetCode","submitStatsGlobal":{"acSubmissionNum":[{"difficulty":"All","count":205},{"difficulty":"Easy","count":103},{"difficulty":"Medium","count":98},{"difficulty":"Hard","count":4}]}}}}
        """;

    private const string NoSuchUser = """
        {"errors":[{"message":"That user does not exist.","path":["matchedUser"]}],
        "data":{"allQuestionsCount":[{"difficulty":"All","count":4073},{"difficulty":"Easy","count":969},{"difficulty":"Medium","count":2124},{"difficulty":"Hard","count":980}],"matchedUser":null}}
        """;

    [Fact]
    public void Reads_solved_and_total_counts_per_difficulty()
    {
        var stats = LeetCodeClient.Parse(Found, Now);

        Assert.Equal(new LeetCodeStats("NeetCode", new DifficultyCounts(205, 103, 98, 4), new DifficultyCounts(4073, 969, 2124, 980), Now), stats);
    }

    [Fact]
    public void An_unknown_user_is_null()
    {
        Assert.Null(LeetCodeClient.Parse(NoSuchUser, Now));
    }

    [Theory]
    [InlineData("""{"errors":[{"message":"rate limited"}]}""")]
    [InlineData("""{"data":{"allQuestionsCount":null,"matchedUser":null}}""")]
    [InlineData("""{"data":{"allQuestionsCount":[{"difficulty":"Easy","count":1}],"matchedUser":null}}""")]
    public void An_unexpected_answer_throws(string json)
    {
        Assert.Throws<InvalidDataException>(() => LeetCodeClient.Parse(json, Now));
    }
}
