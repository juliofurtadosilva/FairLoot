using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FairLoot.Migrations
{
    /// <inheritdoc />
    public partial class AddPriorityWeights : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "PriorityBeta",
                table: "guilds",
                type: "double precision",
                nullable: false,
                defaultValue: 0.3);

            migrationBuilder.AddColumn<double>(
                name: "PriorityGamma",
                table: "guilds",
                type: "double precision",
                nullable: false,
                defaultValue: 0.3);

            // update existing guilds: set new weights and adjust alpha from 0.7 to 0.4
            migrationBuilder.Sql("UPDATE guilds SET \"PriorityBeta\" = 0.3, \"PriorityGamma\" = 0.3, \"PriorityAlpha\" = 0.4");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // restore original alpha weight
            migrationBuilder.Sql("UPDATE guilds SET \"PriorityAlpha\" = 0.7");

            migrationBuilder.DropColumn(
                name: "PriorityBeta",
                table: "guilds");

            migrationBuilder.DropColumn(
                name: "PriorityGamma",
                table: "guilds");
        }
    }
}
