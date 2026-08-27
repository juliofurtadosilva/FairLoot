using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FairLoot.Migrations
{
    /// <inheritdoc />
    public partial class AddDiscordDigestSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DiscordDigestChannelId",
                table: "guilds",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DiscordDigestDifficulties",
                table: "guilds",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "DiscordDigestEnabled",
                table: "guilds",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "DiscordDigestRoleId",
                table: "guilds",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DiscordDigestChannelId",
                table: "guilds");

            migrationBuilder.DropColumn(
                name: "DiscordDigestDifficulties",
                table: "guilds");

            migrationBuilder.DropColumn(
                name: "DiscordDigestEnabled",
                table: "guilds");

            migrationBuilder.DropColumn(
                name: "DiscordDigestRoleId",
                table: "guilds");
        }
    }
}
