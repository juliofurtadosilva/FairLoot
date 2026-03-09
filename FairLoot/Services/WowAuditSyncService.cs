using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection;
using FairLoot.Data;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using System;
using System.Linq;
using Microsoft.EntityFrameworkCore;

namespace FairLoot.Services
{
    public class WowAuditSyncService : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<WowAuditSyncService> _logger;
        private readonly TimeSpan _interval = TimeSpan.FromMinutes(30);

        public WowAuditSyncService(IServiceScopeFactory scopeFactory, ILogger<WowAuditSyncService> logger)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("WowAuditSyncService started");
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                    var wow = scope.ServiceProvider.GetRequiredService<WowAuditService>();

                    var guilds = await db.Guilds.Where(g => !string.IsNullOrEmpty(g.WowauditApiKey)).ToListAsync(stoppingToken);
                    foreach (var g in guilds)
                    {
                        try
                        {
                            await wow.SyncGuildCharactersAsync(db, g.Id, g.WowauditApiKey!, stoppingToken);
                            // SyncGuildCharactersAsync already calls GetGuildWishlistSummaryAsync
                            // which warms the in-memory cache for 30 minutes, so the next
                            // user request will hit the cache instead of WowAudit API.
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Failed to sync guild {GuildId}", g.Id);
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error in WowAuditSyncService loop");
                }

                await Task.Delay(_interval, stoppingToken);
            }
        }
    }
}
