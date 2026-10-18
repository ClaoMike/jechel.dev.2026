namespace Portfolio.Api;

/// <summary>
/// Keeps one value in memory and fetches it again once it's <c>freshFor</c> old. If fetching
/// fails, the last value is kept and returned, and fetching is tried again after
/// <c>retryAfter</c>; with no earlier value, the failure is thrown. Only one fetch runs at a
/// time, so requests arriving together cause one fetch. Register it as a singleton.
/// </summary>
public class RefreshingCache<T>(TimeProvider time, TimeSpan freshFor, TimeSpan retryAfter) where T : class
{
    private readonly SemaphoreSlim _lock = new(1, 1);
    private T? _value;
    private DateTimeOffset _until;

    /// <summary>Forgets the value, so the next <see cref="GetAsync"/> fetches it, e.g. after its source changed.</summary>
    public void Clear()
    {
        _value = null;
        _until = default;
    }

    public async Task<T> GetAsync(Func<CancellationToken, Task<T>> fetch, CancellationToken cancellationToken)
    {
        if (_value is { } cached && time.GetUtcNow() < _until) return cached;

        await _lock.WaitAsync(cancellationToken);
        try
        {
            // Another request may have fetched it while this one waited.
            if (_value is { } fetched && time.GetUtcNow() < _until) return fetched;

            try
            {
                _value = await fetch(cancellationToken);
                _until = time.GetUtcNow() + freshFor;
            }
            catch when (_value is not null && !cancellationToken.IsCancellationRequested)
            {
                _until = time.GetUtcNow() + retryAfter;
            }
            return _value;
        }
        finally
        {
            _lock.Release();
        }
    }
}
