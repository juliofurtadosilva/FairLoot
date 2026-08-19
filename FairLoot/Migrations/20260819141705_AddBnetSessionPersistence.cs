using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FairLoot.Migrations
{
    /// <inheritdoc />
    public partial class AddBnetSessionPersistence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "bnet_login_sessions",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    Expiry = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    BattleNetId = table.Column<string>(type: "text", nullable: true),
                    BattleTag = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bnet_login_sessions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "bnet_sessions",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    Expiry = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CharactersJson = table.Column<string>(type: "text", nullable: false),
                    Region = table.Column<string>(type: "text", nullable: false),
                    BattleNetId = table.Column<string>(type: "text", nullable: true),
                    BattleTag = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bnet_sessions", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "bnet_login_sessions");

            migrationBuilder.DropTable(
                name: "bnet_sessions");
        }
    }
}
