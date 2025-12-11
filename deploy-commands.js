// Komut deploy scripti
require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

// Komut tanımları
const commands = [
  // Mevcut işletme anketi komutu
  new SlashCommandBuilder()
    .setName('anketiyolla')
    .setDescription('Bu kanala işletme form butonu yerleştirir.')
    .toJSON(),

  // Event ekleme komutu (Admin)
  new SlashCommandBuilder()
    .setName('eventekle')
    .setDescription('Takvime yeni bir event ekler. (Yetkili)')
    .toJSON(),

  // Event listeleme komutu
  new SlashCommandBuilder()
    .setName('eventlistele')
    .setDescription('Tüm kayıtlı eventleri listeler.')
    .toJSON(),

  // Event silme komutu (Admin)
  new SlashCommandBuilder()
    .setName('eventsil')
    .setDescription('Takvimden bir event siler. (Yetkili)')
    .toJSON()
];

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
    console.log(`Yüklenecek komutlar: ${commands.map(c => c.name).join(', ')}`);

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );

    console.log('✅ Komutlar başarıyla yüklendi:');
    commands.forEach(cmd => {
      console.log(`  - /${cmd.name}: ${cmd.description}`);
    });
  } catch (err) {
    console.error('Komut yükleme hatası:', err);
  }
})();
