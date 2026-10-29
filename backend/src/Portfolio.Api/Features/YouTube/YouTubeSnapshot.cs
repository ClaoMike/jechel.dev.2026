using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Portfolio.Api.Features.YouTube;

/// <summary>
/// The last list of videos fetched for a channel (Features/YouTube), kept so it survives restarts
/// and can be shown while YouTube is unreachable.
/// </summary>
public class YouTubeSnapshot
{
    /// <summary>The configured channel (handle or id), lower-cased.</summary>
    public required string Channel { get; set; }

    /// <summary>The YouTubeVideo list, newest first, as JSON.</summary>
    public required string Videos { get; set; }

    public DateTimeOffset FetchedAt { get; set; }
}

/// <summary>How <see cref="YouTubeSnapshot"/> is stored (its table and columns).</summary>
internal sealed class YouTubeSnapshotConfiguration : IEntityTypeConfiguration<YouTubeSnapshot>
{
    public void Configure(EntityTypeBuilder<YouTubeSnapshot> entity)
    {
        entity.ToTable("youtube_videos");
        entity.HasKey(s => s.Channel);
        entity.Property(s => s.Channel).HasColumnName("channel").HasMaxLength(100);
        entity.Property(s => s.Videos).HasColumnName("videos").HasColumnType("jsonb").IsRequired();
        entity.Property(s => s.FetchedAt).HasColumnName("fetched_at");
    }
}
