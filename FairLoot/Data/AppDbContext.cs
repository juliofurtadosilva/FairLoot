using Microsoft.EntityFrameworkCore;
using FairLoot.Domain;

namespace FairLoot.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options)
            : base(options)
        {
        }

        public DbSet<Guild> Guilds { get; set; }
        public DbSet<User> Users { get; set; }
        public DbSet<RefreshToken> RefreshTokens { get; set; }
        public DbSet<Character> Characters { get; set; }
        public DbSet<LootDrop> LootDrops { get; set; }
        public DbSet<WishlistCache> WishlistCaches { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<User>().ToTable("users");
            modelBuilder.Entity<Guild>().ToTable("guilds");

            modelBuilder.Entity<Guild>()
                .HasIndex(g => new { g.Name, g.Server })
                .IsUnique();

            modelBuilder.Entity<User>()
                .HasIndex(u => u.Email)
                .IsUnique();

            modelBuilder.Entity<User>()
                .HasOne(u => u.Guild)
                .WithMany(g => g.Members)
                .HasForeignKey(u => u.GuildId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<RefreshToken>().ToTable("refresh_tokens");
            modelBuilder.Entity<RefreshToken>()
                .HasIndex(r => r.Token)
                .IsUnique();

            modelBuilder.Entity<RefreshToken>()
                .HasOne(r => r.User)
                .WithMany(u => u.RefreshTokens)
                .HasForeignKey(r => r.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Character>().ToTable("characters");
            modelBuilder.Entity<Character>()
                .HasOne(c => c.Guild)
                .WithMany(g => g.Characters)
                .HasForeignKey(c => c.GuildId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<LootDrop>().ToTable("loot_drops");

            modelBuilder.Entity<WishlistCache>().ToTable("wishlist_cache");
            modelBuilder.Entity<WishlistCache>()
                .HasIndex(w => w.GuildId)
                .IsUnique();
        }
    }
}