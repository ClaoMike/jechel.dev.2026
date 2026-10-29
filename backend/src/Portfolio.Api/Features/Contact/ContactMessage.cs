using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Portfolio.Api.Features.Contact;

/// <summary>
/// The start of a conversation: a message sent through the public contact form, or an email to the site's
/// address (hello@…) from someone it hasn't heard from. The admin answers by email, from that address; their
/// answers, and everything the visitor emails back, are <see cref="ContactReply"/>s.
/// </summary>
public class ContactMessage
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public required string Email { get; set; }
    public required string Message { get; set; }
    public DateTimeOffset ReceivedAt { get; set; }

    /// <summary>When the admin first opened it; null while unread, and again after the visitor writes back.</summary>
    public DateTimeOffset? ReadAt { get; set; }

    /// <summary>When anyone last wrote in it: the inbox lists conversations by this, newest first.</summary>
    public DateTimeOffset LastActivityAt { get; set; }

    /// <summary>The email's subject, for a conversation that started by email; the answers keep it ("Re: …").</summary>
    public string? Subject { get; set; }

    /// <summary>Resend's id of the email it came in, when it did: an email is only taken once.</summary>
    public string? EmailId { get; set; }

    /// <summary>The email's Message-ID header: the answer refers to it, so their mail app puts both in one thread.</summary>
    public string? EmailMessageId { get; set; }
}

/// <summary>How <see cref="ContactMessage"/> is stored (its table and columns).</summary>
internal sealed class ContactMessageConfiguration : IEntityTypeConfiguration<ContactMessage>
{
    public void Configure(EntityTypeBuilder<ContactMessage> entity)
    {
        entity.ToTable("contact_messages");
        entity.HasKey(m => m.Id);
        entity.Property(m => m.Id).HasColumnName("id");
        entity.Property(m => m.Name).HasColumnName("name").HasMaxLength(ContactRules.NameMaxLength).IsRequired();
        entity.Property(m => m.Email).HasColumnName("email").HasMaxLength(ContactRules.EmailMaxLength).IsRequired();
        // Longer than the form allows: a conversation can start with an email.
        entity.Property(m => m.Message).HasColumnName("message").HasMaxLength(Features.Contact.ContactShared.ReplyMaxLength).IsRequired();
        entity.Property(m => m.ReceivedAt).HasColumnName("received_at");
        entity.Property(m => m.ReadAt).HasColumnName("read_at");
        entity.Property(m => m.LastActivityAt).HasColumnName("last_activity_at");
        entity.Property(m => m.Subject).HasColumnName("subject").HasMaxLength(300);
        entity.Property(m => m.EmailId).HasColumnName("email_id").HasMaxLength(100);
        entity.Property(m => m.EmailMessageId).HasColumnName("email_message_id").HasMaxLength(500);

        // The inbox lists the latest conversations first.
        entity.HasIndex(m => m.ReceivedAt);
        entity.HasIndex(m => m.LastActivityAt);
        entity.HasIndex(m => m.EmailId).IsUnique();
        // An email from someone joins their latest conversation.
        entity.HasIndex(m => m.Email);
    }
}
