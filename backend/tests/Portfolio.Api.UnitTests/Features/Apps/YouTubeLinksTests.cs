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
    [InlineData("https://music.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ")]
    [InlineData("https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ")]
    [InlineData("https://WWW.YouTube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ")]
    [InlineData("https://youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ")]
    [InlineData("https://www.youtube.com/watch?v=dQw4w9WgXcQx", null)]
    [InlineData("https://www.youtube.com/watch?v=dQw4w9WgX!Q", null)]
    [InlineData("https://youtu.be/", null)]
    [InlineData("https://www.youtube.com/watch", null)]
    [InlineData("https://www.youtube.com/embed/dQw4w9WgXcQ/extra", null)]
    [InlineData("ftp://www.youtube.com/watch?v=dQw4w9WgXcQ", null)]
    [InlineData("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ", null)]
    [InlineData("www.youtube.com/watch?v=dQw4w9WgXcQ", null)]
    [InlineData(null, null)]
    [InlineData("https://www.youtube.com/@claomike", null)]
    [InlineData("https://www.youtube.com/playlist?list=PL123", null)]
    [InlineData("https://www.youtube.com/watch?v=short", null)]
    [InlineData("https://www.youtube.com/@CiresariiStudio", null)]
    [InlineData("https://evil.example/watch?v=dQw4w9WgXcQ", null)]
    [InlineData("javascript:alert(1)", null)]
    [InlineData("", null)]
    public void Finds_the_video_id(string? url, string? id)
    {
        Assert.Equal(id, YouTubeLinks.VideoIdIn(url));
    }

    [Fact]
    public void Builds_the_watch_link_it_stores() =>
        Assert.Equal("https://www.youtube.com/watch?v=dQw4w9WgXcQ", YouTubeLinks.WatchUrl("dQw4w9WgXcQ"));
}
