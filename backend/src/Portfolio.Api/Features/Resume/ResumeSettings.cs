using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Portfolio.Api.Features.Contact;

namespace Portfolio.Api.Features.Resume;

/// <summary>
/// The résumé the admin generates from the About Me page: their choices, the private contact
/// details, and the two PDFs last generated. One row. Nothing here is in the public About Me JSON:
/// the phone number only ever reaches the admin.
/// </summary>
public class ResumeSettings
{
    public const int SingletonId = 1;

    public int Id { get; set; }

    /// <summary>Private: only in <see cref="PrivatePdf"/>.</summary>
    public string Phone { get; set; } = "";

    public string Email { get; set; } = "";

    /// <summary>Under the name, e.g. "Full-stack engineer · .NET, React, PostgreSQL".</summary>
    public string Headline { get; set; } = "";

    /// <summary>The sections to include, as a JSON array of <see cref="Features.Resume.ResumeSections"/> ids.</summary>
    public string Sections { get; set; } = "[]";

    /// <summary>The About Me skills left out, as a JSON array of their names.</summary>
    public string ExcludedSkills { get; set; } = "[]";

    /// <summary>Without the phone number: what visitors download.</summary>
    public byte[]? PublicPdf { get; set; }

    /// <summary>With the phone number: for job applications. Admin only.</summary>
    public byte[]? PrivatePdf { get; set; }

    public DateTimeOffset? GeneratedAt { get; set; }
}

/// <summary>How <see cref="ResumeSettings"/> is stored (its table and columns).</summary>
internal sealed class ResumeSettingsConfiguration : IEntityTypeConfiguration<ResumeSettings>
{
    public void Configure(EntityTypeBuilder<ResumeSettings> entity)
    {
        entity.ToTable("resume");
        entity.HasKey(r => r.Id);
        entity.Property(r => r.Id).HasColumnName("id").ValueGeneratedNever();
        entity.Property(r => r.Phone).HasColumnName("phone").HasMaxLength(Features.Resume.ResumeRules.PhoneMaxLength).IsRequired();
        entity.Property(r => r.Email).HasColumnName("email").HasMaxLength(ContactRules.EmailMaxLength).IsRequired();
        entity.Property(r => r.Headline).HasColumnName("headline").HasMaxLength(Features.Resume.ResumeRules.HeadlineMaxLength).IsRequired();
        entity.Property(r => r.Sections).HasColumnName("sections").HasColumnType("jsonb").IsRequired();
        entity.Property(r => r.ExcludedSkills).HasColumnName("excluded_skills").HasColumnType("jsonb").IsRequired().HasDefaultValueSql("'[]'::jsonb");
        entity.Property(r => r.PublicPdf).HasColumnName("public_pdf");
        entity.Property(r => r.PrivatePdf).HasColumnName("private_pdf");
        entity.Property(r => r.GeneratedAt).HasColumnName("generated_at");
    }
}
