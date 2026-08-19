using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FairLoot.Migrations
{
    /// <inheritdoc />
    public partial class RemoveWowauditTeamIdAndSessionCookie : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "WowauditSessionCookie",
                table: "guilds");

            migrationBuilder.DropColumn(
                name: "WowauditTeamId",
                table: "guilds");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "WowauditSessionCookie",
                table: "guilds",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "WowauditTeamId",
                table: "guilds",
                type: "integer",
                nullable: true);
        }
    }
}
