using Portfolio.Api.Features.Apps;

namespace Portfolio.Api.UnitTests.Features.Apps;

public class YouTubeLinksTests
{
    [Theory]
    [InlineData("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ")]
    [InlineData("https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=42", "dQw4w9WgXcQ")]
    [InlineData("https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ")]
    [InlineData("https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ")]
    [InlineData("https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ")]
    [InlineData("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ")]
    [InlineData(" http://www.youtube.com/embed/dQw4w9WgXcQ/ ", "dQw4w9WgXcQ")]
    [InlineData("https://www.youtube.com/watch?v=short", null)]
    [InlineData("https://www.youtube.com/@CiresariiStudio", null)]
    [InlineData("https://evil.example/watch?v=dQw4w9WgXcQ", null)]
    [InlineData("javascript:alert(1)", null)]
    [InlineData("", null)]
    public void Finds_the_video_id(string url, string? id)
    {
        Assert.Equal(id, YouTubeLinks.VideoIdIn(url));
    }
}
