using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Portfolio.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ContactConversations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "from_visitor",
                table: "contact_replies",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "last_activity_at",
                table: "contact_messages",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<string>(
                name: "token",
                table: "contact_messages",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            // Messages from before conversations: each gets its own random link (two version-4 UUIDs, 244 random
            // bits, hex), and its last activity is its own time or its latest reply's.
            migrationBuilder.Sql("""
                UPDATE contact_messages
                SET token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
                    last_activity_at = greatest(received_at, coalesce((SELECT max(r.sent_at) FROM contact_replies r WHERE r.message_id = contact_messages.id), received_at));
                """);

            migrationBuilder.CreateIndex(
                name: "IX_contact_messages_last_activity_at",
                table: "contact_messages",
                column: "last_activity_at");

            migrationBuilder.CreateIndex(
                name: "IX_contact_messages_token",
                table: "contact_messages",
                column: "token",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_contact_messages_last_activity_at",
                table: "contact_messages");

            migrationBuilder.DropIndex(
                name: "IX_contact_messages_token",
                table: "contact_messages");

            migrationBuilder.DropColumn(
                name: "from_visitor",
                table: "contact_replies");

            migrationBuilder.DropColumn(
                name: "last_activity_at",
                table: "contact_messages");

            migrationBuilder.DropColumn(
                name: "token",
                table: "contact_messages");
        }
    }
}
