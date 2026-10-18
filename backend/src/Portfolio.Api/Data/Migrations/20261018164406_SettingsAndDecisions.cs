using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Portfolio.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SettingsAndDecisions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "is_public",
                table: "donations");

            migrationBuilder.AddColumn<string>(
                name: "excluded_skills",
                table: "resume",
                type: "jsonb",
                nullable: false,
                defaultValueSql: "'[]'::jsonb");

            migrationBuilder.AddColumn<string>(
                name: "payload",
                table: "donations",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AlterColumn<DateTimeOffset>(
                name: "sent_at",
                table: "announcements",
                type: "timestamp with time zone",
                nullable: true,
                oldClrType: typeof(DateTimeOffset),
                oldType: "timestamp with time zone");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "created_at",
                table: "announcements",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.Sql("UPDATE announcements SET created_at = sent_at WHERE sent_at IS NOT NULL;");

            migrationBuilder.AddColumn<string>(
                name: "decision_token_hash",
                table: "announcements",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "status",
                table: "announcements",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                // Rows from before had all been emailed.
                defaultValue: "sent");

            migrationBuilder.CreateTable(
                name: "site_settings",
                columns: table => new
                {
                    key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    value = table.Column<string>(type: "text", nullable: false),
                    is_encrypted = table.Column<bool>(type: "boolean", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_site_settings", x => x.key);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "site_settings");

            migrationBuilder.DropColumn(
                name: "excluded_skills",
                table: "resume");

            migrationBuilder.DropColumn(
                name: "payload",
                table: "donations");

            migrationBuilder.DropColumn(
                name: "created_at",
                table: "announcements");

            migrationBuilder.DropColumn(
                name: "decision_token_hash",
                table: "announcements");

            migrationBuilder.DropColumn(
                name: "status",
                table: "announcements");

            migrationBuilder.AddColumn<bool>(
                name: "is_public",
                table: "donations",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AlterColumn<DateTimeOffset>(
                name: "sent_at",
                table: "announcements",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)),
                oldClrType: typeof(DateTimeOffset),
                oldType: "timestamp with time zone",
                oldNullable: true);
        }
    }
}
