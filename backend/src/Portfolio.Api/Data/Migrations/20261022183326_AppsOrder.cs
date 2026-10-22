using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Portfolio.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AppsOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_apps_created_at",
                table: "apps");

            migrationBuilder.AddColumn<int>(
                name: "position",
                table: "apps",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "show_in_whats_new",
                table: "apps",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            // The order the Apps page had until now, newest first, numbered from 0. (Every app could be shown in
            // What's new? before: true above, for the existing ones only; the model has no default, see the DbContext.)
            migrationBuilder.Sql("""
                UPDATE apps SET position = ordered.n
                FROM (SELECT id, row_number() OVER (ORDER BY created_at DESC, id DESC) - 1 AS n FROM apps) AS ordered
                WHERE apps.id = ordered.id;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_apps_position",
                table: "apps",
                column: "position");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_apps_position",
                table: "apps");

            migrationBuilder.DropColumn(
                name: "position",
                table: "apps");

            migrationBuilder.DropColumn(
                name: "show_in_whats_new",
                table: "apps");

            migrationBuilder.CreateIndex(
                name: "IX_apps_created_at",
                table: "apps",
                column: "created_at");
        }
    }
}
