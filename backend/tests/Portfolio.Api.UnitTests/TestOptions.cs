using Microsoft.Extensions.Options;

namespace Portfolio.Api.UnitTests;

/// <summary>An <see cref="IOptionsMonitor{T}"/> that always holds one value.</summary>
public sealed class TestOptions<T>(T value) : IOptionsMonitor<T>
{
    public T CurrentValue => value;
    public T Get(string? name) => value;
    public IDisposable? OnChange(Action<T, string?> listener) => null;
}

public static class TestOptions
{
    public static TestOptions<T> Monitor<T>(T value) => new(value);
}
