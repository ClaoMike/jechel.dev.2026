using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace __NAMESPACE__.Api.Features.Greetings;

/// <summary>A greeting the home page shows: the example feature, from the database to the page.</summary>
public class Greeting
{
    public int Id { get; set; }
    public required string Text { get; set; }
}

/// <summary>How <see cref="Greeting"/> is stored (its table and columns).</summary>
internal sealed class GreetingConfiguration : IEntityTypeConfiguration<Greeting>
{
    public void Configure(EntityTypeBuilder<Greeting> entity)
    {
        entity.ToTable("greetings");
        entity.HasKey(g => g.Id);
        entity.Property(g => g.Id).HasColumnName("id");
        entity.Property(g => g.Text).HasColumnName("text").HasMaxLength(200).IsRequired();
        entity.HasData(new Greeting { Id = 1, Text = "Hello from __NAME__" });
    }
}
