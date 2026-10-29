using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Portfolio.Api.Features.WorkWithMe;

/// <summary>Work with me's hourly price, as the admin set it. One row; until the admin first saves one, the default (Features.WorkWithMe.WorkWithMePrices.Default).</summary>
public class WorkWithMePrice
{
    public const int SingletonId = 1;

    public int Id { get; set; }

    /// <summary>An ISO 4217 code from Features.WorkWithMe.WorkWithMePrices.Currencies, e.g. "EUR".</summary>
    public required string Currency { get; set; }

    /// <summary>An hour's price, up to two decimals.</summary>
    public decimal Amount { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>How <see cref="WorkWithMePrice"/> is stored (its table and columns).</summary>
internal sealed class WorkWithMePriceConfiguration : IEntityTypeConfiguration<WorkWithMePrice>
{
    public void Configure(EntityTypeBuilder<WorkWithMePrice> entity)
    {
        entity.ToTable("work_with_me_price");
        entity.HasKey(p => p.Id);
        entity.Property(p => p.Id).HasColumnName("id").ValueGeneratedNever();
        entity.Property(p => p.Currency).HasColumnName("currency").HasMaxLength(3).IsRequired();
        entity.Property(p => p.Amount).HasColumnName("amount").HasPrecision(12, 2);
        entity.Property(p => p.UpdatedAt).HasColumnName("updated_at");
    }
}
