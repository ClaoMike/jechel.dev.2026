using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Portfolio.Api.Features.Auth;

/// <summary>
/// A signed-in device of the admin (Features/Auth). Its cookie carries a random token; only the token's
/// hash is kept here, so a database leak can't be used to sign in. Deleted when it's signed out or ends.
/// </summary>
public class AdminSession
{
    public Guid Id { get; set; }

    /// <summary>SHA-256 (hex) of the cookie's token.</summary>
    public required string TokenHash { get; set; }

    /// <summary>The Google account it was started with.</summary>
    public required string Email { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>The last request seen from it (to the minute: it's only written when the session is extended).</summary>
    public DateTimeOffset LastSeenAt { get; set; }

    /// <summary>Ends now unless there's activity before then (the idle timeout).</summary>
    public DateTimeOffset ExpiresAt { get; set; }

    /// <summary>Ends then whatever happens (the absolute limit): activity never pushes <see cref="ExpiresAt"/> past it.</summary>
    public DateTimeOffset EndsAt { get; set; }

    /// <summary>The browser that signed in, to tell the devices apart.</summary>
    public string UserAgent { get; set; } = "";

    public string? IpAddress { get; set; }

    /// <summary>Two letters, from Cloudflare (CF-IPCountry), when known.</summary>
    public string? Country { get; set; }
}

/// <summary>How <see cref="AdminSession"/> is stored (its table and columns).</summary>
internal sealed class AdminSessionConfiguration : IEntityTypeConfiguration<AdminSession>
{
    public void Configure(EntityTypeBuilder<AdminSession> entity)
    {
        entity.ToTable("admin_sessions");
        entity.HasKey(s => s.Id);
        entity.Property(s => s.Id).HasColumnName("id").ValueGeneratedNever();
        entity.Property(s => s.TokenHash).HasColumnName("token_hash").HasMaxLength(64).IsRequired();
        entity.Property(s => s.Email).HasColumnName("email").HasMaxLength(320).IsRequired();
        entity.Property(s => s.CreatedAt).HasColumnName("created_at");
        entity.Property(s => s.LastSeenAt).HasColumnName("last_seen_at");
        entity.Property(s => s.ExpiresAt).HasColumnName("expires_at");
        entity.Property(s => s.EndsAt).HasColumnName("ends_at");
        entity.Property(s => s.UserAgent).HasColumnName("user_agent").HasMaxLength(AdminSessionService.UserAgentMaxLength).IsRequired();
        entity.Property(s => s.IpAddress).HasColumnName("ip_address").HasMaxLength(45);
        entity.Property(s => s.Country).HasColumnName("country").HasMaxLength(2);

        // Every request with the cookie finds its session by the token's hash.
        entity.HasIndex(s => s.TokenHash).IsUnique();
    }
}
