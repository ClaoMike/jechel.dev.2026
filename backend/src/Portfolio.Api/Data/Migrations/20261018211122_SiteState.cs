using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Portfolio.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SiteState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "site_state",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false),
                    pages = table.Column<string>(type: "jsonb", nullable: false),
                    features = table.Column<string>(type: "jsonb", nullable: false),
                    maintenance_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    maintenance_message = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_site_state", x => x.id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "site_state");
        }
    }
}
