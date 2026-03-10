using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FairLoot.Migrations
{
    /// <inheritdoc />
    public partial class AllowMultipleBnetAccounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_users_BattleNetId",
                table: "users");

            migrationBuilder.CreateIndex(
                name: "IX_users_BattleNetId",
                table: "users",
                column: "BattleNetId",
                filter: "\"BattleNetId\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_users_BattleNetId",
                table: "users");

            migrationBuilder.CreateIndex(
                name: "IX_users_BattleNetId",
                table: "users",
                column: "BattleNetId",
                unique: true,
                filter: "\"BattleNetId\" IS NOT NULL");
        }
    }
}
