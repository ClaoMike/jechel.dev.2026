using System.Security.Cryptography;
using System.Text;

namespace Portfolio.Api.Features.Analytics;

/// <summary>
/// Turns an IP address and User-Agent into a visitor id that's the same all day (UTC) and different the
/// next. The day's salt is random and lives only in memory, so nobody (us included) can go from a
/// stored hash back to an IP address. A restart picks a new salt, so a visitor may count twice that day.
/// </summary>
public sealed class VisitorHasher(TimeProvider time)
{
    private readonly Lock _lock = new();
    private DateOnly _day;
    private byte[] _salt = [];

    public string Hash(string? ipAddress, string? userAgent)
    {
        var salt = SaltFor(DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime));
        var input = Encoding.UTF8.GetBytes($"{ipAddress}|{userAgent}");
        return Convert.ToHexStringLower(HMACSHA256.HashData(salt, input));
    }

    private byte[] SaltFor(DateOnly day)
    {
        lock (_lock)
        {
            if (day != _day)
            {
                _day = day;
                _salt = RandomNumberGenerator.GetBytes(32);
            }
            return _salt;
        }
    }
}
