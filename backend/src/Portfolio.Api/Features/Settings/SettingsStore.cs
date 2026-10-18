using System.Reflection;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Primitives;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Settings;

/// <summary>
/// The settings saved in the Settings tab, decrypted and kept in memory. Options bound with
/// <see cref="SettingsOptionsExtensions.BindWithSettings{T}"/> read them on top of the configuration, and
/// <see cref="IOptionsMonitor{T}"/> sees a change as soon as it's saved (<see cref="ReloadAsync"/>).
/// </summary>
public class SettingsStore(IDataProtectionProvider protection, ILogger<SettingsStore> logger)
{
    private readonly IDataProtector _protector = protection.CreateProtector("Portfolio.Settings.v1");
    private volatile IReadOnlyDictionary<string, string> _values = new Dictionary<string, string>();
    private CancellationTokenSource _changed = new();

    /// <summary>The saved value, or null when the Settings tab hasn't set it (then the configuration's applies).</summary>
    public string? Get(string key) => _values.TryGetValue(key, out var value) ? value : null;

    public IChangeToken ChangeToken => new CancellationChangeToken(_changed.Token);

    public string Protect(string value) => _protector.Protect(value);

    public async Task ReloadAsync(PortfolioDbContext db, CancellationToken cancellationToken)
    {
        var rows = await db.SiteSettings.AsNoTracking().ToListAsync(cancellationToken);
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in rows)
        {
            try
            {
                values[row.Key] = row.IsEncrypted ? _protector.Unprotect(row.Value) : row.Value;
            }
            catch (System.Security.Cryptography.CryptographicException e)
            {
                // The Data Protection keys changed (e.g. a new server without the old keys): it has to be entered again.
                logger.LogWarning(e, "The setting {Key} can't be decrypted; save it again in the Settings tab.", row.Key);
            }
        }
        _values = values;

        var previous = Interlocked.Exchange(ref _changed, new CancellationTokenSource());
        previous.Cancel();
    }
}

/// <summary>Tells <see cref="IOptionsMonitor{T}"/> to recompute <typeparamref name="T"/> when the settings change.</summary>
public class SettingsChangeTokenSource<T>(SettingsStore store) : IOptionsChangeTokenSource<T>
{
    public string Name => Options.DefaultName;
    public IChangeToken GetChangeToken() => store.ChangeToken;
}

public static class SettingsOptionsExtensions
{
    /// <summary>
    /// Binds <typeparamref name="T"/> to the configuration section, then lets the Settings tab override
    /// any of its string properties ("{section}:{property}"). Read it through <see cref="IOptionsMonitor{T}"/>.
    /// </summary>
    public static IServiceCollection BindWithSettings<T>(this IServiceCollection services, IConfiguration configuration, string section) where T : class
    {
        var properties = typeof(T).GetProperties(BindingFlags.Public | BindingFlags.Instance).Where(p => p.PropertyType == typeof(string) && p.CanWrite).ToList();
        services.AddOptions<T>()
            .Bind(configuration.GetSection(section))
            .PostConfigure<SettingsStore>((options, store) =>
            {
                foreach (var property in properties)
                {
                    if (store.Get($"{section}:{property.Name}") is { Length: > 0 } value) property.SetValue(options, value);
                }
            });
        services.AddSingleton<IOptionsChangeTokenSource<T>, SettingsChangeTokenSource<T>>();
        return services;
    }
}
