using Microsoft.AspNetCore.Http;

namespace Portfolio.Api.UnitTests;

public class RequestBodiesTests
{
    /// <summary>A body that hands out at most 1,000 bytes a read and never says how long it is, as a chunked upload does.</summary>
    private sealed class Trickle(byte[] content) : MemoryStream(content)
    {
        public int Reads { get; private set; }

        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            Reads++;
            return base.ReadAsync(buffer[..Math.Min(buffer.Length, 1000)], cancellationToken);
        }
    }

    private static HttpRequest Request(Stream body, long? declared = null)
    {
        var context = new DefaultHttpContext();
        context.Request.Body = body;
        context.Request.ContentLength = declared;
        return context.Request;
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(5000)]
    public async Task A_body_up_to_the_limit_is_read_whole(int length)
    {
        var content = Enumerable.Range(0, length).Select(i => (byte)i).ToArray();

        Assert.Equal(content, await RequestBodies.ReadLimitedAsync(Request(new Trickle(content)), 5000, default));
    }

    [Fact]
    public async Task A_longer_body_sent_in_pieces_is_refused_without_reading_it_all()
    {
        var body = new Trickle(new byte[1_000_000]);

        Assert.Null(await RequestBodies.ReadLimitedAsync(Request(body), 5000, default));
        Assert.True(body.Reads <= 6, $"{body.Reads} reads");
    }

    [Fact]
    public async Task A_body_declared_too_long_isn_t_read_at_all()
    {
        var body = new Trickle(new byte[10]);

        Assert.Null(await RequestBodies.ReadLimitedAsync(Request(body, declared: 5001), 5000, default));
        Assert.Equal(0, body.Reads);
    }
}
