using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Portfolio.Api.Features.Contact;

/// <summary>A message after the first in a conversation: an answer the admin emailed, or one the visitor emailed back.</summary>
public class ContactReply
{
    public int Id { get; set; }
    public int MessageId { get; set; }
    public required string Text { get; set; }
    public DateTimeOffset SentAt { get; set; }

    /// <summary>Emailed by the visitor; false for the admin's answers (emailed to them).</summary>
    public bool FromVisitor { get; set; }

    /// <summary>Resend's id of the visitor's email: an email is only taken once.</summary>
    public string? EmailId { get; set; }

    /// <summary>The visitor's email's Message-ID header: the next answer refers to it.</summary>
    public string? EmailMessageId { get; set; }
}

/// <summary>How <see cref="ContactReply"/> is stored (its table and columns).</summary>
internal sealed class ContactReplyConfiguration : IEntityTypeConfiguration<ContactReply>
{
    public void Configure(EntityTypeBuilder<ContactReply> entity)
    {
        entity.ToTable("contact_replies");
        entity.HasKey(r => r.Id);
        entity.Property(r => r.Id).HasColumnName("id");
        entity.Property(r => r.MessageId).HasColumnName("message_id");
        entity.Property(r => r.Text).HasColumnName("text").HasMaxLength(Features.Contact.ContactShared.ReplyMaxLength).IsRequired();
        entity.Property(r => r.SentAt).HasColumnName("sent_at");
        entity.Property(r => r.FromVisitor).HasColumnName("from_visitor");
        entity.Property(r => r.EmailId).HasColumnName("email_id").HasMaxLength(100);
        entity.Property(r => r.EmailMessageId).HasColumnName("email_message_id").HasMaxLength(500);

        // Deleting a message deletes its replies.
        entity.HasOne<ContactMessage>().WithMany().HasForeignKey(r => r.MessageId).OnDelete(DeleteBehavior.Cascade);
        entity.HasIndex(r => r.MessageId);
        entity.HasIndex(r => r.EmailId).IsUnique();
    }
}
