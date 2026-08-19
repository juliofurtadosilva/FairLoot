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
    /// <summary>Keeps the SimC upload audit log from growing forever — deletes entries older than a week.</summary>
    public class SimcUploadLogCleanupService : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<SimcUploadLogCleanupService> _logger;
        private static readonly TimeSpan Retention = TimeSpan.FromDays(7);
        private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(24);

        public SimcUploadLogCleanupService(IServiceScopeFactory scopeFactory, ILogger<SimcUploadLogCleanupService> logger)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("SimcUploadLogCleanupService started");
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                    var cutoff = DateTime.UtcNow - Retention;
                    var deleted = await db.SimcUploadLogs
                        .Where(l => l.CreatedAt < cutoff)
                        .ExecuteDeleteAsync(stoppingToken);

                    if (deleted > 0)
                        _logger.LogInformation("Deleted {Count} SimC upload log entries older than {Days} days", deleted, Retention.TotalDays);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error in SimcUploadLogCleanupService loop");
                }

                await Task.Delay(CheckInterval, stoppingToken);
            }
        }
    }
}
