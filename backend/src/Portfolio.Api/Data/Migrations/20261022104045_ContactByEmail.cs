using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Portfolio.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ContactByEmail : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_contact_messages_token",
                table: "contact_messages");

            migrationBuilder.DropColumn(
                name: "token",
                table: "contact_messages");

            migrationBuilder.AddColumn<string>(
                name: "email_id",
                table: "contact_replies",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "email_message_id",
                table: "contact_replies",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "message",
                table: "contact_messages",
                type: "character varying(5000)",
                maxLength: 5000,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(1000)",
                oldMaxLength: 1000);

            migrationBuilder.AddColumn<string>(
                name: "email_id",
                table: "contact_messages",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "email_message_id",
                table: "contact_messages",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "subject",
                table: "contact_messages",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_contact_replies_email_id",
                table: "contact_replies",
                column: "email_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_contact_messages_email",
                table: "contact_messages",
                column: "email");

            migrationBuilder.CreateIndex(
                name: "IX_contact_messages_email_id",
                table: "contact_messages",
                column: "email_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_contact_replies_email_id",
                table: "contact_replies");

            migrationBuilder.DropIndex(
                name: "IX_contact_messages_email",
                table: "contact_messages");

            migrationBuilder.DropIndex(
                name: "IX_contact_messages_email_id",
                table: "contact_messages");

            migrationBuilder.DropColumn(
                name: "email_id",
                table: "contact_replies");

            migrationBuilder.DropColumn(
                name: "email_message_id",
                table: "contact_replies");

            migrationBuilder.DropColumn(
                name: "email_id",
                table: "contact_messages");

            migrationBuilder.DropColumn(
                name: "email_message_id",
                table: "contact_messages");

            migrationBuilder.DropColumn(
                name: "subject",
                table: "contact_messages");

            migrationBuilder.AlterColumn<string>(
                name: "message",
                table: "contact_messages",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(5000)",
                oldMaxLength: 5000);

            migrationBuilder.AddColumn<string>(
                name: "token",
                table: "contact_messages",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql("UPDATE contact_messages SET token = replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');");

            migrationBuilder.CreateIndex(
                name: "IX_contact_messages_token",
                table: "contact_messages",
                column: "token",
                unique: true);
        }
    }
}
