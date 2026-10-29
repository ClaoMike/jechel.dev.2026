using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Portfolio.Api.Features.Profile;

public class Profile
{
    public int Id { get; set; }
    public required string FirstName { get; set; }
}

/// <summary>How <see cref="Profile"/> is stored (its table and columns).</summary>
internal sealed class ProfileConfiguration : IEntityTypeConfiguration<Profile>
{
    public void Configure(EntityTypeBuilder<Profile> entity)
    {
        entity.ToTable("profiles");
        entity.HasKey(p => p.Id);
        entity.Property(p => p.Id).HasColumnName("id");
        entity.Property(p => p.FirstName).HasColumnName("first_name").HasMaxLength(100).IsRequired();

        entity.HasData(new Profile { Id = 1, FirstName = "Claudiu" });
    }
}
