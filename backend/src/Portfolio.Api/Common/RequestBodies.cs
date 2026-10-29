namespace Portfolio.Api.Common;

/// <summary>Webhook bodies: read only up to their limit, however the sender sends them (a declared length or chunks).</summary>
public static class RequestBodies
{
    /// <summary>The body, or null when it's longer than <paramref name="max"/> bytes (no more than that is read).</summary>
    public static async Task<byte[]?> ReadLimitedAsync(HttpRequest request, int max, CancellationToken cancellationToken)
    {
        if (request.ContentLength > max) return null;
        using var buffer = new MemoryStream();
        var chunk = new byte[16 * 1024];
        int read;
        while ((read = await request.Body.ReadAsync(chunk, cancellationToken)) > 0)
        {
            if (buffer.Length + read > max) return null;
            buffer.Write(chunk, 0, read);
        }
        return buffer.ToArray();
    }
}
