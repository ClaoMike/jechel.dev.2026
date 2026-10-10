using System.Text.Json;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.LeetCode;

/// <summary>
/// Gets a user's LeetCode stats without asking LeetCode on every page view. Two cache layers:
/// <list type="number">
/// <item>Memory (<see cref="LeetCodeMemoryCache"/>): instant, but lost on restart.</item>
/// <item>PostgreSQL (the leetcode_stats table): survives restarts, and is what's shown while LeetCode is down.</item>
/// </list>
/// Stats are fetched again once they're <see cref="FreshFor"/> old. When that fails, the saved
/// stats are shown, and LeetCode is tried again after <see cref="RetryAfter"/>.
/// </summary>
public class LeetCodeStatsService(
    PortfolioDbContext db,
    ILeetCodeClient leetCode,
    LeetCodeMemoryCache memory,
    TimeProvider time,
    ILogger<LeetCodeStatsService> logger)
{
    public static readonly TimeSpan FreshFor = TimeSpan.FromHours(6);
    public static readonly TimeSpan RetryAfter = TimeSpan.FromMinutes(15);

    public async Task<LeetCodeLookup> GetAsync(string username, CancellationToken cancellationToken)
    {
        // 1. In memory and not expired: the usual case, no database or LeetCode call at all.
        if (memory.TryGet(username, time.GetUtcNow(), out var cached)) return cached;

        await memory.RefreshLock.WaitAsync(cancellationToken);
        try
        {
            // Another request may have refreshed it while this one waited for the lock.
            var now = time.GetUtcNow();
            if (memory.TryGet(username, now, out cached)) return cached;

            // 2. Saved in the database recently enough, e.g. right after a restart.
            var key = username.ToLowerInvariant();
            var saved = await db.LeetCodeStats.FindAsync([key], cancellationToken);
            var savedStats = saved is null ? null : JsonSerializer.Deserialize<LeetCodeStats>(saved.Stats, JsonSerializerOptions.Web);
            if (savedStats is not null && now - savedStats.FetchedAt < FreshFor)
            {
                var lookup = new LeetCodeLookup(savedStats);
                memory.Set(username, lookup, savedStats.FetchedAt + FreshFor);
                return lookup;
            }

            // 3. Ask LeetCode.
            LeetCodeStats? fresh;
            try
            {
                fresh = await leetCode.FetchAsync(username, cancellationToken);
            }
            catch (Exception e) when (!cancellationToken.IsCancellationRequested)
            {
                // Down, slow, blocked us, or changed its API: show what was saved, if anything.
                logger.LogWarning(e, "Couldn't get the LeetCode stats of {Username}; showing the saved ones from {FetchedAt}.", username, savedStats?.FetchedAt);
                var fallback = savedStats is null ? LeetCodeLookup.Unavailable : new LeetCodeLookup(savedStats);
                memory.Set(username, fallback, now + RetryAfter);
                return fallback;
            }

            if (fresh is null)
            {
                memory.Set(username, LeetCodeLookup.NotFound, now + RetryAfter);
                return LeetCodeLookup.NotFound;
            }

            if (saved is null)
            {
                saved = new LeetCodeSnapshot { Username = key, Stats = "" };
                db.LeetCodeStats.Add(saved);
            }
            saved.Stats = JsonSerializer.Serialize(fresh, JsonSerializerOptions.Web);
            saved.FetchedAt = fresh.FetchedAt;
            await db.SaveChangesAsync(cancellationToken);

            var result = new LeetCodeLookup(fresh);
            memory.Set(username, result, now + FreshFor);
            return result;
        }
        finally
        {
            memory.RefreshLock.Release();
        }
    }
}
