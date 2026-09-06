require('dotenv').config();
const http = require('http');
const { Client, GatewayIntentBits, Events } = require('discord.js');

const { DISCORD_TOKEN, FAIRLOOT_API_URL, FAIRLOOT_BOT_SHARED_SECRET } = process.env;

for (const [name, value] of Object.entries({ DISCORD_TOKEN, FAIRLOOT_API_URL, FAIRLOOT_BOT_SHARED_SECRET })) {
  if (!value) {
    console.error(`Faltou configurar ${name} (veja .env.example)`);
    process.exit(1);
  }
}

// Render's free "Web Service" tier requires binding to $PORT and will sleep the
// instance after 15 minutes with no HTTP traffic — this connection isn't HTTP, so
// it never counts. This server exists only so an external uptime pinger (e.g.
// UptimeRobot, free) has something to hit every ~10 minutes to keep the bot awake.
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => { res.writeHead(200); res.end('ok'); }).listen(PORT, () => {
  console.log(`Keep-alive HTTP server listening on ${PORT}`);
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const DIFFICULTY_LABELS = { normal: 'Normal', heroic: 'Heroico', mythic: 'Mítico' };

client.once(Events.ClientReady, c => {
  console.log(`Bot online como ${c.user.tag}`);
  startDailyDigestScheduler();
});

// Posts the "outdated SimC" digest once a day, at whatever time+timezone each guild configured in
// the Admin panel (captured from that admin's own browser — a US guild's 9pm means their 9pm, not
// wherever the bot process happens to run), to every Discord server the bot is actually in. Checked
// once a minute — that tick only compares small in-memory numbers, it's not what would be expensive.
// The one thing that actually costs anything (fetching wowaudit's wishlist) only runs the moment
// we're sure it's time to post, via a separate light "digest-schedule" endpoint (DB-only, no
// external API call).
const lastDigestRunDate = new Map(); // guildId -> 'YYYY-MM-DD' in that guild's own timezone, guards against firing twice in a day

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function zonedNow(timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
    weekday: WEEKDAY_INDEX[get('weekday')],
  };
}

function startDailyDigestScheduler() {
  setInterval(checkAllGuildsForDigest, 60_000);
}

async function checkAllGuildsForDigest() {
  for (const guild of client.guilds.cache.values()) {
    try {
      const schedule = await fetchJson('digest-schedule', { discordServerId: guild.id });
      if (!schedule?.enabled) continue;

      const { date, time, weekday } = zonedNow(schedule.timezone || 'America/Sao_Paulo');
      const allowedDays = (schedule.daysOfWeek || '0,1,2,3,4,5,6').split(',').map(Number);
      const isAllowedDay = allowedDays.includes(weekday);
      const isScheduledTime = isAllowedDay && schedule.time === time && lastDigestRunDate.get(guild.id) !== date;
      // a manual "send now" always fires regardless of which days are configured — that's the point of it
      if (!schedule.manualTrigger && !isScheduledTime) continue;

      if (isScheduledTime) lastDigestRunDate.set(guild.id, date);
      await postDigestForGuild(guild.id, schedule.manualTrigger);
    } catch (err) {
      console.error(`Digest schedule check falhou para guild ${guild.id}:`, err);
    }
  }
}

async function fetchJson(path, params, options) {
  const url = `${FAIRLOOT_API_URL}/api/discord/${path}?${new URLSearchParams({ sharedSecret: FAIRLOOT_BOT_SHARED_SECRET, ...params })}`;
  const res = await fetch(url, options);
  return res.json().catch(() => null);
}

async function postDigestForGuild(discordServerId, wasManualTrigger) {
  try {
    const data = await fetchJson('outdated-digest', { discordServerId });
    if (!data?.enabled || !data.channelId) return;

    if (data.players && data.players.length > 0) {
      const channel = await client.channels.fetch(data.channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        console.error(`Digest: canal ${data.channelId} não encontrado/inválido na guild ${discordServerId}`);
      } else {
        const mention = data.roleId ? `<@&${data.roleId}> ` : '';
        const lines = data.players.map(p => `• **${p.name}** — ${p.difficulties.map(d => DIFFICULTY_LABELS[d] || d).join(', ')}`);
        const message = `${mention}⚠️ **SimC desatualizado** — os seguintes jogadores precisam atualizar (\`/simc <link>\`):\n${lines.join('\n')}`;
        await channel.send({ content: message, allowedMentions: { roles: data.roleId ? [data.roleId] : [] } });
        console.log(`Digest enviado para guild ${discordServerId} (${data.players.length} jogadores)`);
      }
    }
  } finally {
    // a manual "send now" fires exactly once — clear the flag whether or not there was anything to post
    if (wasManualTrigger) {
      await fetchJson('digest-trigger/consume', { discordServerId }, { method: 'POST' }).catch(() => {});
    }
  }
}

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'simc') return;

  const url = interaction.options.getString('link', true);

  if (!interaction.guildId) {
    await interaction.reply({ content: '❌ Esse comando só funciona dentro de um servidor.', ephemeral: true });
    return;
  }

  // Ack within Discord's 3s window immediately — the FairLoot backend may be asleep (Render free tier)
  // and take up to ~60s to wake up. Deferring buys up to 15 minutes before we must edit this reply.
  await interaction.deferReply();

  try {
    const res = await fetch(`${FAIRLOOT_API_URL}/api/discord/upload-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sharedSecret: FAIRLOOT_BOT_SHARED_SECRET,
        discordServerId: interaction.guildId,
        url,
        discordUserId: interaction.user.id,
        discordUsername: interaction.user.username,
      }),
    });
    const rawBody = await res.text();
    let data = null;
    try { data = JSON.parse(rawBody); } catch { /* not JSON — handled below */ }

    if (data?.success) {
      const bits = [`✅ Enviado para **${data.characterName}**`];
      if (data.difficulty) bits.push(`[${DIFFICULTY_LABELS[data.difficulty] || data.difficulty}]`);
      if (data.realm) bits.push(`(${data.realm})`);
      if (data.spec) bits.push(`· ${data.spec}`);
      if (data.source) bits.push(`· via ${data.source}`);
      await interaction.editReply(bits.join(' '));
    } else if (data?.error) {
      await interaction.editReply(`❌ ${data.error}`);
    } else {
      // Backend didn't return the JSON shape we expect (cold-start proxy error page, timeout, etc.)
      // — log the raw response for debugging and surface the HTTP status so it's not a dead end.
      console.error(`Resposta inesperada do FairLoot (HTTP ${res.status}):`, rawBody.slice(0, 500));
      const snippet = rawBody.trim().slice(0, 200);
      await interaction.editReply(
        `❌ Erro inesperado do FairLoot (HTTP ${res.status}). Tenta de novo em 1 minuto — se persistir, avisa o Admin.` +
        (snippet ? `\n\`\`\`${snippet}\`\`\`` : '')
      );
    }
  } catch (err) {
    console.error('Erro ao chamar o FairLoot:', err);
    await interaction.editReply(`❌ Não consegui contatar o FairLoot (${err.message}). Tenta de novo em um minuto.`);
  }
});

client.login(DISCORD_TOKEN);
