// 
require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

// Komut tanımı
const commands = [
  new SlashCommandBuilder()
    .setName('anketiyolla')
    .setDescription('Bu kanala form butonu yerleştirir.')
    .toJSON()
];

// 
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

    console.log('Komutlar yükleniyor (guild scope)...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Komutlar başarıyla yüklendi.');
  } catch (err) {
    console.error('Komut yükleme hatası:', err);
  }
})();
