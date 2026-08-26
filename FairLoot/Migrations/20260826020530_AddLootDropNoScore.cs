using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FairLoot.Migrations
{
    /// <inheritdoc />
    public partial class AddLootDropNoScore : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "NoScore",
                table: "loot_drops",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "NoScore",
                table: "loot_drops");
        }
    }
}
