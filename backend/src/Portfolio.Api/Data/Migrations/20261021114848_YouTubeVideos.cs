using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Portfolio.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class YouTubeVideos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "youtube_videos",
                columns: table => new
                {
                    channel = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    videos = table.Column<string>(type: "jsonb", nullable: false),
                    fetched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_youtube_videos", x => x.channel);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "youtube_videos");
        }
    }
}
