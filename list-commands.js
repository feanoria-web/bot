// 
require('dotenv').config();
const { REST, Routes } = require('discord.js');

const token = process.env.TOKEN || process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN?.trim();

if (!token) {
  console.error('Hata: Token bulunamadı. .env içinde TOKEN veya DISCORD_TOKEN tanımlı olmalı.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    if (!process.env.CLIENT_ID || !process.env.GUILD_ID) {
      console.error('Hata: .env içinde CLIENT_ID veya GUILD_ID eksik.');
      process.exit(1);
    }

    const cmds = await rest.get(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID));
    console.log('Guild komutları (count):', Array.isArray(cmds) ? cmds.length : cmds);
    console.dir(cmds, { depth: 2 });
  } catch (err) {
    console.error('Komutları listelerken hata:', err);
  }
})();
