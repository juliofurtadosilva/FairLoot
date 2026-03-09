using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FairLoot.Migrations
{
    /// <inheritdoc />
    public partial class AddCharacterNameAndPriorityAlpha : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CharacterName",
                table: "users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "PriorityAlpha",
                table: "guilds",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CharacterName",
                table: "users");

            migrationBuilder.DropColumn(
                name: "PriorityAlpha",
                table: "guilds");
        }
    }
}
