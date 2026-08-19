// One-off script: registers the /simc slash command with Discord.
// Run again any time you change the command's name/description/options.
require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('simc')
    .setDescription('Envia um relatório do Raidbots ou QuestionablyEpic pro wowaudit')
    .addStringOption(opt =>
      opt.setName('link')
        .setDescription('URL do relatório (raidbots.com ou questionablyepic.com)')
        .setRequired(true)
    ),
].map(c => c.toJSON());

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('Faltam DISCORD_TOKEN e/ou DISCORD_CLIENT_ID no .env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    if (DISCORD_GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), { body: commands });
      console.log('/simc registrado no servidor', DISCORD_GUILD_ID, '(aparece na hora).');
    } else {
      await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: commands });
      console.log('/simc registrado globalmente (pode levar até 1h pra aparecer em todos os servidores).');
    }
  } catch (err) {
    console.error('Falha ao registrar comando:', err);
    process.exit(1);
  }
})();
