using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Portfolio.Api.Features.Analytics;

/// <summary>Something that happened during a visit: a page opened, a click, an error… (see Features/Analytics/AnalyticsRules.cs).</summary>
public class VisitEvent
{
    public long Id { get; set; }
    public Guid SessionId { get; set; }

    /// <summary>The browser's counter within the visit (from 1): orders the events, and makes a batch sent twice harmless.</summary>
    public int Sequence { get; set; }

    public DateTimeOffset OccurredAt { get; set; }

    /// <summary>One of <see cref="Features.Analytics.AnalyticsRules.EventTypes"/>.</summary>
    public required string Type { get; set; }

    /// <summary>The page it happened on.</summary>
    public required string Path { get; set; }

    /// <summary>What it was about: the button's text, the error message, the event name.</summary>
    public string? Label { get; set; }

    /// <summary>A JSON object of strings, e.g. an error's stack, or a link's address. Null when there's nothing more.</summary>
    public string? Detail { get; set; }
}

/// <summary>How <see cref="VisitEvent"/> is stored (its table and columns).</summary>
internal sealed class VisitEventConfiguration : IEntityTypeConfiguration<VisitEvent>
{
    public void Configure(EntityTypeBuilder<VisitEvent> entity)
    {
        entity.ToTable("visit_events");
        entity.HasKey(e => e.Id);
        entity.Property(e => e.Id).HasColumnName("id");
        entity.Property(e => e.SessionId).HasColumnName("session_id");
        entity.Property(e => e.Sequence).HasColumnName("sequence");
        entity.Property(e => e.OccurredAt).HasColumnName("occurred_at");
        entity.Property(e => e.Type).HasColumnName("type").HasMaxLength(20).IsRequired();
        entity.Property(e => e.Path).HasColumnName("path").HasMaxLength(AnalyticsRules.PathMaxLength).IsRequired();
        entity.Property(e => e.Label).HasColumnName("label").HasMaxLength(AnalyticsRules.LabelMaxLength);
        entity.Property(e => e.Detail).HasColumnName("detail").HasColumnType("jsonb");

        // One row per sequence number: a batch sent twice isn't stored twice.
        entity.HasIndex(e => new { e.SessionId, e.Sequence }).IsUnique();
        entity.HasIndex(e => e.OccurredAt);
    }
}
