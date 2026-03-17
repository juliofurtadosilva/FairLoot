using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FairLoot.Migrations
{
    /// <inheritdoc />
    public partial class AddPenaltiesAndNoteFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Note",
                table: "loot_drops",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MinIlevelHeroic",
                table: "guilds",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "MinIlevelMythic",
                table: "guilds",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "MinIlevelNormal",
                table: "guilds",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "IsNewPlayer",
                table: "characters",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Note",
                table: "loot_drops");

            migrationBuilder.DropColumn(
                name: "MinIlevelHeroic",
                table: "guilds");

            migrationBuilder.DropColumn(
                name: "MinIlevelMythic",
                table: "guilds");

            migrationBuilder.DropColumn(
                name: "MinIlevelNormal",
                table: "guilds");

            migrationBuilder.DropColumn(
                name: "IsNewPlayer",
                table: "characters");
        }
    }
}
