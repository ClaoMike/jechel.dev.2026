using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Portfolio.Api.Data;

namespace Portfolio.Api.Features.Contact;

/// <summary>Body of the public contact form. Nullable so missing fields become validation errors, not 400s without details.</summary>
public record SendMessageRequest(string? Name, string? Email, string? Message);

public record ContactMessageSummary(int Id, string Name, DateTimeOffset ReceivedAt, bool IsRead);

public record ContactMessageDetails(int Id, string Name, string Email, string Message, DateTimeOffset ReceivedAt, DateTimeOffset? ReadAt);

public record PagedResponse<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);

public static class ContactEndpoints
{
    public const int DefaultPageSize = 10;
    public const int MaxPageSize = 50;

    public static IEndpointRouteBuilder MapContactEndpoints(this IEndpointRouteBuilder app)
    {
        var contact = app.MapGroup("/contact");

        // Public: anyone can send a message.
        contact.MapPost("/", SendMessage).WithName("SendContactMessage");

        // Admin only: the inbox.
        var messages = contact.MapGroup("/messages").RequireAuthorization();
        messages.MapGet("/", ListMessages).WithName("ListContactMessages");
        messages.MapGet("/{id:int}", GetMessage).WithName("GetContactMessage");
        messages.MapPost("/{id:int}/read", MarkAsRead).WithName("MarkContactMessageAsRead");
        messages.MapDelete("/{id:int}", DeleteMessage).WithName("DeleteContactMessage");

        return app;
    }

    public static async Task<Results<Created, ValidationProblem>> SendMessage(
        SendMessageRequest request,
        PortfolioDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var errors = ContactRules.Validate(request);
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        db.ContactMessages.Add(new ContactMessage
        {
            Name = request.Name!.Trim(),
            Email = request.Email!.Trim(),
            Message = request.Message!.Trim(),
            ReceivedAt = time.GetUtcNow(),
        });
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.Created();
    }

    /// <summary>Newest first. Out-of-range pages return no items (with the real total).</summary>
    public static async Task<Ok<PagedResponse<ContactMessageSummary>>> ListMessages(
        PortfolioDbContext db,
        CancellationToken cancellationToken,
        int page = 1,
        int pageSize = DefaultPageSize)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var totalCount = await db.ContactMessages.CountAsync(cancellationToken);
        var items = await db.ContactMessages
            .AsNoTracking()
            .OrderByDescending(m => m.ReceivedAt)
            .ThenByDescending(m => m.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(m => new ContactMessageSummary(m.Id, m.Name, m.ReceivedAt, m.ReadAt != null))
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(new PagedResponse<ContactMessageSummary>(items, page, pageSize, totalCount));
    }

    /// <summary>Reading the details does not mark the message as read; the viewer calls <see cref="MarkAsRead"/>.</summary>
    public static async Task<Results<Ok<ContactMessageDetails>, NotFound>> GetMessage(
        int id,
        PortfolioDbContext db,
        CancellationToken cancellationToken)
    {
        var message = await db.ContactMessages
            .AsNoTracking()
            .Where(m => m.Id == id)
            .Select(m => new ContactMessageDetails(m.Id, m.Name, m.Email, m.Message, m.ReceivedAt, m.ReadAt))
            .FirstOrDefaultAsync(cancellationToken);

        return message is null ? TypedResults.NotFound() : TypedResults.Ok(message);
    }

    /// <summary>Idempotent: keeps the time it was first read.</summary>
    public static async Task<Results<NoContent, NotFound>> MarkAsRead(
        int id,
        PortfolioDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var message = await db.ContactMessages.FindAsync([id], cancellationToken);
        if (message is null)
        {
            return TypedResults.NotFound();
        }

        if (message.ReadAt is null)
        {
            message.ReadAt = time.GetUtcNow();
            await db.SaveChangesAsync(cancellationToken);
        }

        return TypedResults.NoContent();
    }

    /// <summary>Deletes the message for good.</summary>
    public static async Task<Results<NoContent, NotFound>> DeleteMessage(
        int id,
        PortfolioDbContext db,
        CancellationToken cancellationToken)
    {
        var message = await db.ContactMessages.FindAsync([id], cancellationToken);
        if (message is null)
        {
            return TypedResults.NotFound();
        }

        db.ContactMessages.Remove(message);
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }
}
