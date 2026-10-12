using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Portfolio.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class VisitAnalytics : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "visit_sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    visitor_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    entry_path = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    referrer = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    referrer_host = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    utm_source = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    utm_medium = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    utm_campaign = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    user_agent = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    device = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    browser = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    operating_system = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    country = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: true),
                    language = table.Column<string>(type: "character varying(35)", maxLength: 35, nullable: true),
                    time_zone = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    screen_width = table.Column<int>(type: "integer", nullable: false),
                    screen_height = table.Column<int>(type: "integer", nullable: false),
                    viewport_width = table.Column<int>(type: "integer", nullable: false),
                    viewport_height = table.Column<int>(type: "integer", nullable: false),
                    theme = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    page_views = table.Column<int>(type: "integer", nullable: false),
                    interaction_count = table.Column<int>(type: "integer", nullable: false),
                    event_count = table.Column<int>(type: "integer", nullable: false),
                    error_count = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_visit_sessions", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "visit_events",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sequence = table.Column<int>(type: "integer", nullable: false),
                    occurred_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    path = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    label = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    detail = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_visit_events", x => x.id);
                    table.ForeignKey(
                        name: "FK_visit_events_visit_sessions_session_id",
                        column: x => x.session_id,
                        principalTable: "visit_sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_visit_events_occurred_at",
                table: "visit_events",
                column: "occurred_at");

            migrationBuilder.CreateIndex(
                name: "IX_visit_events_session_id_sequence",
                table: "visit_events",
                columns: new[] { "session_id", "sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_visit_sessions_started_at",
                table: "visit_sessions",
                column: "started_at");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "visit_events");

            migrationBuilder.DropTable(
                name: "visit_sessions");
        }
    }
}
