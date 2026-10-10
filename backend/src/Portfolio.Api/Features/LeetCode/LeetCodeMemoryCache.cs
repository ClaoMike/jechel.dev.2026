using System.Collections.Concurrent;

namespace Portfolio.Api.Features.LeetCode;

/// <summary>What asking for a user's stats gave: stats, no such user, or neither (LeetCode is unreachable and nothing was saved).</summary>
public record LeetCodeLookup(LeetCodeStats? Stats, bool NoSuchUser = false)
{
    public static readonly LeetCodeLookup Unavailable = new(Stats: null);
    public static readonly LeetCodeLookup NotFound = new(Stats: null, NoSuchUser: true);
}

/// <summary>
/// The fast layer of the LeetCode cache: answers kept in memory until a set time, per username.
/// Registered as a singleton, so every request shares it; it's empty again after a restart.
/// </summary>
public class LeetCodeMemoryCache
{
    private readonly ConcurrentDictionary<string, (LeetCodeLookup Lookup, DateTimeOffset Until)> _entries = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Held while asking LeetCode, so visitors arriving together cause one call, not one each.</summary>
    public SemaphoreSlim RefreshLock { get; } = new(1, 1);

    public bool TryGet(string username, DateTimeOffset now, out LeetCodeLookup lookup)
    {
        if (_entries.TryGetValue(username, out var entry) && now < entry.Until)
        {
            lookup = entry.Lookup;
            return true;
        }
        lookup = LeetCodeLookup.Unavailable;
        return false;
    }

    public void Set(string username, LeetCodeLookup lookup, DateTimeOffset until) => _entries[username] = (lookup, until);
}
