namespace Portfolio.Api.Data;

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
