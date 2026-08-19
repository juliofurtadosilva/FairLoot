require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');

const { DISCORD_TOKEN, FAIRLOOT_API_URL, FAIRLOOT_BOT_SHARED_SECRET } = process.env;

for (const [name, value] of Object.entries({ DISCORD_TOKEN, FAIRLOOT_API_URL, FAIRLOOT_BOT_SHARED_SECRET })) {
  if (!value) {
    console.error(`Faltou configurar ${name} (veja .env.example)`);
    process.exit(1);
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const DIFFICULTY_LABELS = { normal: 'Normal', heroic: 'Heroico', mythic: 'Mítico' };

client.once(Events.ClientReady, c => {
  console.log(`Bot online como ${c.user.tag}`);
});

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
    const data = await res.json().catch(() => null);

    if (data?.success) {
      const bits = [`✅ Enviado para **${data.characterName}**`];
      if (data.difficulty) bits.push(`[${DIFFICULTY_LABELS[data.difficulty] || data.difficulty}]`);
      if (data.realm) bits.push(`(${data.realm})`);
      if (data.spec) bits.push(`· ${data.spec}`);
      if (data.source) bits.push(`· via ${data.source}`);
      await interaction.editReply(bits.join(' '));
    } else {
      await interaction.editReply(`❌ ${data?.error || 'Erro desconhecido ao enviar o relatório.'}`);
    }
  } catch (err) {
    console.error('Erro ao chamar o FairLoot:', err);
    await interaction.editReply('❌ Não consegui contatar o FairLoot. Tenta de novo em um minuto.');
  }
});

client.login(DISCORD_TOKEN);
