using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Portfolio.Api.Features.LeetCode;

/// <summary>
/// The last LeetCode stats fetched for a user (Features/LeetCode), kept so they survive restarts
/// and can be shown while LeetCode is unreachable.
/// </summary>
public class LeetCodeSnapshot
{
    /// <summary>Lower-cased: LeetCode usernames aren't case-sensitive.</summary>
    public required string Username { get; set; }

    /// <summary>A LeetCodeStats, as JSON.</summary>
    public required string Stats { get; set; }

    public DateTimeOffset FetchedAt { get; set; }
}

/// <summary>How <see cref="LeetCodeSnapshot"/> is stored (its table and columns).</summary>
internal sealed class LeetCodeSnapshotConfiguration : IEntityTypeConfiguration<LeetCodeSnapshot>
{
    public void Configure(EntityTypeBuilder<LeetCodeSnapshot> entity)
    {
        entity.ToTable("leetcode_stats");
        entity.HasKey(s => s.Username);
        entity.Property(s => s.Username).HasColumnName("username").HasMaxLength(50);
        entity.Property(s => s.Stats).HasColumnName("stats").HasColumnType("jsonb").IsRequired();
        entity.Property(s => s.FetchedAt).HasColumnName("fetched_at");
    }
}
