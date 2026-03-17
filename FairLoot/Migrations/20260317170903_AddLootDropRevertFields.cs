using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FairLoot.Migrations
{
    /// <inheritdoc />
    public partial class AddLootDropRevertFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsReverted",
                table: "loot_drops",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "RevertedAt",
                table: "loot_drops",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsReverted",
                table: "loot_drops");

            migrationBuilder.DropColumn(
                name: "RevertedAt",
                table: "loot_drops");
        }
    }
}
