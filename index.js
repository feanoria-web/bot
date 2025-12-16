// Event Takvimi ve İşletme Anket Botu
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

// Slash komutları tanımla
const slashCommands = [
  new SlashCommandBuilder()
    .setName('anketiyolla')
    .setDescription('Bu kanala işletme form butonu yerleştirir.')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('eventekle')
    .setDescription('Takvime yeni bir event ekler. (Yetkili)')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('eventlistele')
    .setDescription('Tüm kayıtlı eventleri listeler.')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('eventsil')
    .setDescription('Takvimden bir event siler. (Yetkili)')
    .toJSON()
];

const token = process.env.TOKEN || process.env.DISCORD_TOKEN || (process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN.trim());
if (!token) {
  console.error('Hata: TOKEN bulunamadı. .env içinde TOKEN veya DISCORD_TOKEN tanımlı olmalı.');
  process.exit(1);
}

// Event veritabanı dosyası
const EVENTS_FILE = path.join(__dirname, 'events.json');

// Event verilerini yükle
function loadEvents() {
  try {
    if (fs.existsSync(EVENTS_FILE)) {
      const data = fs.readFileSync(EVENTS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Events yüklenirken hata:', err);
  }
  return { events: [] };
}

// Event verilerini kaydet
function saveEvents(data) {
  try {
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Events kaydedilirken hata:', err);
    return false;
  }
}

// Tarih formatını kontrol et (GG.AA.YYYY veya GG/AA/YYYY)
function parseDate(dateStr) {
  const patterns = [
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/, // GG.AA.YYYY
    /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/  // YYYY.AA.GG
  ];

  for (const pattern of patterns) {
    const match = dateStr.match(pattern);
    if (match) {
      let day, month, year;
      if (match[3].length === 4) {
        // GG.AA.YYYY formatı
        day = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        year = parseInt(match[3], 10);
      } else {
        // YYYY.AA.GG formatı
        year = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        day = parseInt(match[3], 10);
      }

      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2024) {
        return { day, month, year, formatted: `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}` };
      }
    }
  }
  return null;
}

// Belirli bir tarihte çakışan eventleri bul
function findConflictingEvents(dateStr) {
  const eventsData = loadEvents();
  const parsed = parseDate(dateStr);
  if (!parsed) return [];

  return eventsData.events.filter(event => {
    const eventParsed = parseDate(event.date);
    if (!eventParsed) return false;
    return eventParsed.day === parsed.day &&
           eventParsed.month === parsed.month &&
           eventParsed.year === parsed.year;
  });
}

// Yeni event ekle
function addEvent(eventData) {
  const eventsData = loadEvents();
  eventData.id = Date.now().toString();
  eventData.createdAt = new Date().toISOString();
  eventsData.events.push(eventData);
  return saveEvents(eventsData) ? eventData : null;
}

// Event sil
function removeEvent(eventId) {
  const eventsData = loadEvents();
  const index = eventsData.events.findIndex(e => e.id === eventId);
  if (index !== -1) {
    eventsData.events.splice(index, 1);
    return saveEvents(eventsData);
  }
  return false;
}

// Tüm eventleri getir
function getAllEvents() {
  return loadEvents().events;
}

// Ticket kanalı mı kontrol et
function isTicketChannel(channel) {
  const ticketPatterns = [
    /^ticket[-_]/i,
    /[-_]ticket$/i,
    /^destek[-_]/i,
    /[-_]destek$/i,
    /^talep[-_]/i,
    /[-_]talep$/i,
    /^event[-_]talep/i,
    /^etkinlik[-_]/i
  ];

  const channelName = channel.name.toLowerCase();
  return ticketPatterns.some(pattern => pattern.test(channelName));
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection:', reason, p);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

client.once(Events.ClientReady, () => {
  console.log(`${client.user.tag} olarak giriş yapıldı.`);
  console.log('Event Takvimi sistemi aktif!');
});

// Komutları yenileme fonksiyonu
async function refreshCommands(guild) {
  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guild.id),
      { body: slashCommands }
    );
    return true;
  } catch (err) {
    console.error('Komut yenileme hatası:', err);
    return false;
  }
}

// !refresh komutu - Mesaj dinleyici
client.on(Events.MessageCreate, async (message) => {
  // Bot mesajlarını yoksay
  if (message.author.bot) return;

  // !refresh komutu
  if (message.content.toLowerCase() === '!refresh') {
    // Yetki kontrolü - sadece sunucu sahibi veya yetkili rol
    const isOwner = message.guild.ownerId === message.author.id;
    const hasRole = process.env.AUTHORIZED_ROLE_ID &&
                    message.member.roles.cache.has(process.env.AUTHORIZED_ROLE_ID);

    if (!isOwner && !hasRole) {
      return message.reply('❌ Bu komutu kullanmak için yetkiniz yok!');
    }

    const loadingMsg = await message.reply('🔄 Komutlar yenileniyor...');

    const success = await refreshCommands(message.guild);

    if (success) {
      await loadingMsg.edit('✅ Komutlar başarıyla yenilendi!\n\n**Mevcut komutlar:**\n• `/anketiyolla`\n• `/eventekle`\n• `/eventlistele`\n• `/eventsil`');
    } else {
      await loadingMsg.edit('❌ Komutlar yenilenirken bir hata oluştu!');
    }
    return;
  }
});

// Yeni kanal oluşturulduğunda (Ticket algılama)
client.on(Events.ChannelCreate, async (channel) => {
  try {
    // Sadece text kanallarını kontrol et
    if (channel.type !== ChannelType.GuildText) return;

    // Ticket kanalı mı kontrol et
    if (!isTicketChannel(channel)) return;

    console.log(`Yeni ticket kanalı algılandı: ${channel.name}`);

    // Kısa bir bekleme (kanalın tam oluşması için)
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Event talebi embed'i oluştur
    const eventEmbed = new EmbedBuilder()
      .setTitle('🎉 Event Talebi')
      .setDescription(
        'Merhaba! Event talebinizi almak için aşağıdaki bilgileri doldurun.\n\n' +
        '**Lütfen aşağıdaki butona tıklayarak event bilgilerinizi girin:**'
      )
      .setColor(0x5865F2)
      .setFooter({ text: 'Event Takvimi Sistemi' })
      .setTimestamp();

    // Event bilgisi butonu
    const eventButton = new ButtonBuilder()
      .setCustomId('event_request_form')
      .setLabel('📅 Event Bilgilerini Gir')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(eventButton);

    // Mesajı gönder
    await channel.send({ embeds: [eventEmbed], components: [row] });

  } catch (err) {
    console.error('Ticket kanalı algılama hatası:', err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // ============ KOMUTLAR ============

    // /anketiyolla komutu
    if (interaction.isCommand() && interaction.commandName === 'anketiyolla') {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const authorizedRoleId = process.env.AUTHORIZED_ROLE_ID;

      if (authorizedRoleId && !member.roles.cache.has(authorizedRoleId)) {
        return await interaction.reply({
          content: '⚠️ Bu komutu kullanmak için yetkiniz yok.',
          ephemeral: true
        });
      }

      const openFormBtn = new ButtonBuilder()
        .setCustomId('open_form')
        .setLabel('İşletmem Var!')
        .setStyle(ButtonStyle.Primary);

      const removeRoleBtn = new ButtonBuilder()
        .setCustomId('remove_role')
        .setLabel('Rolümü Kaldır!')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder()
        .addComponents(openFormBtn, removeRoleBtn);

      const formChannelId = (process.env.FORM_CHANNEL_ID && process.env.FORM_CHANNEL_ID.trim()) ||
                            (process.env.TARGET_CHANNEL_ID && process.env.TARGET_CHANNEL_ID.trim()) ||
                            interaction.channelId;

      let formChannel = null;
      try {
        formChannel = await interaction.guild.channels.fetch(formChannelId);
      } catch (_) { formChannel = null; }
      if (!formChannel) formChannel = interaction.channel;

      const embed = new EmbedBuilder()
        .setTitle('İşletme Bildirimi')
        .setDescription('Herhangi bir işletme sahibiysen bu butona tıkla!')
        .setImage('https://i.imgur.com/1CWr56F.png')
        .setColor(0x00AE86);

      try {
        await formChannel.send({ embeds: [embed], components: [row] });
      } catch (err) {
        console.error('Form kanalına mesaj gönderilemedi:', err);
        await interaction.channel.send({
          content: 'Herhangi bir işletme sahibiysen bu butona tıkla!',
          components: [row]
        }).catch(() => {});
      }

      await interaction.reply({ content: '✅ İşletmeler için anket butonu hedef kanala gönderildi.', ephemeral: true });
      return;
    }

    // /eventekle komutu - Admin için manuel event ekleme
    if (interaction.isCommand() && interaction.commandName === 'eventekle') {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const authorizedRoleId = process.env.AUTHORIZED_ROLE_ID;

      if (authorizedRoleId && !member.roles.cache.has(authorizedRoleId)) {
        return await interaction.reply({
          content: '⚠️ Bu komutu kullanmak için yetkiniz yok.',
          ephemeral: true
        });
      }

      const modal = new ModalBuilder()
        .setCustomId('admin_event_modal')
        .setTitle('Event Ekle');

      const nameInput = new TextInputBuilder()
        .setCustomId('event_name')
        .setLabel('Event Adı')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Örn: Yılbaşı Partisi');

      const dateInput = new TextInputBuilder()
        .setCustomId('event_date')
        .setLabel('Event Tarihi (GG.AA.YYYY)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Örn: 25.12.2024');

      const timeInput = new TextInputBuilder()
        .setCustomId('event_time')
        .setLabel('Event Saati (SS:DD)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Örn: 21:00');

      const typeInput = new TextInputBuilder()
        .setCustomId('event_type')
        .setLabel('Event Türü (ozel/halka_acik)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('ozel veya halka_acik');

      const posterInput = new TextInputBuilder()
        .setCustomId('event_poster')
        .setLabel('Afiş Linki (halka_acik için zorunlu)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Örn: https://i.imgur.com/xxxxx.png');

      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(dateInput),
        new ActionRowBuilder().addComponents(timeInput),
        new ActionRowBuilder().addComponents(typeInput),
        new ActionRowBuilder().addComponents(posterInput)
      );

      await interaction.showModal(modal);
      return;
    }

    // /eventlistele komutu - Tüm eventleri listele
    if (interaction.isCommand() && interaction.commandName === 'eventlistele') {
      const events = getAllEvents();

      if (events.length === 0) {
        return await interaction.reply({
          content: '📅 Henüz kayıtlı bir event bulunmuyor.',
          ephemeral: true
        });
      }

      // Tarihe göre sırala
      events.sort((a, b) => {
        const dateA = parseDate(a.date);
        const dateB = parseDate(b.date);
        if (!dateA || !dateB) return 0;
        return new Date(dateA.year, dateA.month - 1, dateA.day) -
               new Date(dateB.year, dateB.month - 1, dateB.day);
      });

      const embed = new EmbedBuilder()
        .setTitle('📅 Event Takvimi')
        .setColor(0x5865F2)
        .setTimestamp();

      let description = '';
      events.forEach((event, index) => {
        const typeEmoji = event.type === 'ozel' ? '🔒' : '🌐';
        const status = event.status === 'onaylandi' ? '✅' : '⏳';
        description += `**${index + 1}.** ${typeEmoji} **${event.name}**\n`;
        description += `   📆 ${event.date} 🕐 ${event.time || 'Belirtilmemiş'} | ${status} ${event.status || 'beklemede'}\n`;
        description += `   👤 ${event.requestedBy || 'Bilinmiyor'}\n\n`;
      });

      embed.setDescription(description.substring(0, 4000));

      await interaction.reply({ embeds: [embed], ephemeral: false });
      return;
    }

    // /eventsil komutu
    if (interaction.isCommand() && interaction.commandName === 'eventsil') {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const authorizedRoleId = process.env.AUTHORIZED_ROLE_ID;

      if (authorizedRoleId && !member.roles.cache.has(authorizedRoleId)) {
        return await interaction.reply({
          content: '⚠️ Bu komutu kullanmak için yetkiniz yok.',
          ephemeral: true
        });
      }

      const events = getAllEvents();

      if (events.length === 0) {
        return await interaction.reply({
          content: '📅 Silinecek event bulunmuyor.',
          ephemeral: true
        });
      }

      const options = events.slice(0, 25).map(event => ({
        label: `${event.name} - ${event.date}`.substring(0, 100),
        description: `ID: ${event.id}`.substring(0, 100),
        value: event.id
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('delete_event_select')
        .setPlaceholder('Silmek istediğiniz eventi seçin')
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await interaction.reply({
        content: '🗑️ Silmek istediğiniz eventi seçin:',
        components: [row],
        ephemeral: true
      });
      return;
    }

    // ============ BUTONLAR ============

    // Event talep formu butonu
    if (interaction.isButton() && interaction.customId === 'event_request_form') {
      const modal = new ModalBuilder()
        .setCustomId('event_request_modal')
        .setTitle('Event Bilgileri');

      const nameInput = new TextInputBuilder()
        .setCustomId('event_name')
        .setLabel('Event Adı')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Örn: Doğum Günü Partisi');

      const dateInput = new TextInputBuilder()
        .setCustomId('event_date')
        .setLabel('Event Tarihi (GG.AA.YYYY)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Örn: 25.12.2024');

      const timeInput = new TextInputBuilder()
        .setCustomId('event_time')
        .setLabel('Event Saati (SS:DD)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Örn: 21:00');

      const typeInput = new TextInputBuilder()
        .setCustomId('event_type')
        .setLabel('Event Türü (ozel/halka_acik)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('ozel veya halka_acik yazın');

      const posterInput = new TextInputBuilder()
        .setCustomId('event_poster')
        .setLabel('Afiş Linki (halka_acik için ZORUNLU)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Örn: https://i.imgur.com/xxxxx.png');

      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(dateInput),
        new ActionRowBuilder().addComponents(timeInput),
        new ActionRowBuilder().addComponents(typeInput),
        new ActionRowBuilder().addComponents(posterInput)
      );

      await interaction.showModal(modal);
      return;
    }

    // Çakışmaya rağmen devam et butonu
    if (interaction.isButton() && interaction.customId.startsWith('confirm_event_')) {
      const eventDataStr = interaction.customId.replace('confirm_event_', '');
      let eventData;

      try {
        eventData = JSON.parse(Buffer.from(eventDataStr, 'base64').toString('utf8'));
      } catch {
        return await interaction.reply({
          content: '⚠️ Event verisi okunamadı.',
          ephemeral: true
        });
      }

      eventData.status = 'beklemede';
      eventData.confirmedConflict = true;

      const savedEvent = addEvent(eventData);

      if (savedEvent) {
        const embed = new EmbedBuilder()
          .setTitle('✅ Event Talebi Alındı')
          .setDescription('Çakışmaya rağmen event talebiniz kaydedildi!')
          .addFields(
            { name: '📌 Event Adı', value: eventData.name, inline: true },
            { name: '📅 Tarih', value: eventData.date, inline: true },
            { name: '🕐 Saat', value: eventData.time || 'Belirtilmemiş', inline: true },
            { name: '🔒 Tür', value: eventData.type === 'ozel' ? 'Özel' : 'Halka Açık', inline: true }
          )
          .setColor(0x00FF00)
          .setTimestamp();

        if (eventData.poster) {
          embed.setImage(eventData.poster);
        }

        // Log kanalına bildir
        await logEventRequest(interaction.guild, eventData, interaction.user);

        // Event takvimi kanalına duyuru gönder
        await announceNewEvent(interaction.guild, eventData, interaction.user);

        await interaction.update({
          embeds: [embed],
          components: []
        });
      } else {
        await interaction.reply({
          content: '⚠️ Event kaydedilirken bir hata oluştu.',
          ephemeral: true
        });
      }
      return;
    }

    // Çakışma nedeniyle iptal butonu
    if (interaction.isButton() && interaction.customId === 'cancel_event_conflict') {
      const embed = new EmbedBuilder()
        .setTitle('❌ Event Talebi İptal Edildi')
        .setDescription('Tarih çakışması nedeniyle event talebiniz iptal edildi.')
        .setColor(0xFF0000)
        .setTimestamp();

      await interaction.update({
        embeds: [embed],
        components: []
      });
      return;
    }

    // İşletme formu butonu
    if (interaction.isButton() && interaction.customId === 'open_form') {
      const modal = new ModalBuilder()
        .setCustomId('survey_modal')
        .setTitle('Başvuru Formu');

      const input1 = new TextInputBuilder()
        .setCustomId('q1')
        .setLabel('İşletme Adı')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Cevabınızı yazın.');

      const input2 = new TextInputBuilder()
        .setCustomId('q2')
        .setLabel('İşletme Türü')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Cevabınızı yazın.');

      const input3 = new TextInputBuilder()
        .setCustomId('q3')
        .setLabel('UCP Adı')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder('Cevabınızı yazın.');

      modal.addComponents(
        new ActionRowBuilder().addComponents(input1),
        new ActionRowBuilder().addComponents(input2),
        new ActionRowBuilder().addComponents(input3)
      );

      await interaction.showModal(modal);
      return;
    }

    // Rol kaldırma butonu
    if (interaction.isButton() && interaction.customId === 'remove_role') {
      if (!process.env.ROLE_ID) {
        return interaction.reply({ content: '⚠️ Rol ID bulunamadı.', ephemeral: true });
      }

      try {
        const role = interaction.guild.roles.cache.get(process.env.ROLE_ID);
        if (!role) return interaction.reply({ content: '⚠️ Rol bulunamadı.', ephemeral: true });

        const member = await interaction.guild.members.fetch(interaction.user.id);

        if (member.roles.cache.has(role.id)) {
          await member.roles.remove(role);
          return interaction.reply({ content: `✅ Rolün kaldırıldı: ${role.name}`, ephemeral: true });
        } else {
          return interaction.reply({ content: '⚠️ Bu rol sana zaten verilmemiş.', ephemeral: true });
        }
      } catch (err) {
        console.error('Rol kaldırma hatası:', err);
        return interaction.reply({ content: '⚠️ Rol kaldırma işlemi sırasında bir hata oluştu.', ephemeral: true });
      }
    }

    // ============ SELECT MENÜLER ============

    // Event silme seçimi
    if (interaction.isStringSelectMenu() && interaction.customId === 'delete_event_select') {
      const eventId = interaction.values[0];
      const events = getAllEvents();
      const event = events.find(e => e.id === eventId);

      if (!event) {
        return await interaction.reply({
          content: '⚠️ Event bulunamadı.',
          ephemeral: true
        });
      }

      const success = removeEvent(eventId);

      if (success) {
        await interaction.update({
          content: `✅ **${event.name}** (${event.date}) eventi silindi.`,
          components: []
        });
      } else {
        await interaction.reply({
          content: '⚠️ Event silinirken bir hata oluştu.',
          ephemeral: true
        });
      }
      return;
    }

    // ============ MODALLER ============

    // Event talep modalı (Ticket kanalından)
    if (interaction.isModalSubmit() && interaction.customId === 'event_request_modal') {
      const eventName = interaction.fields.getTextInputValue('event_name');
      const eventDate = interaction.fields.getTextInputValue('event_date');
      const eventTime = interaction.fields.getTextInputValue('event_time');
      const eventType = interaction.fields.getTextInputValue('event_type').toLowerCase();
      const eventPoster = interaction.fields.getTextInputValue('event_poster') || '';

      // Tarih formatını kontrol et
      const parsedDate = parseDate(eventDate);
      if (!parsedDate) {
        return await interaction.reply({
          content: '⚠️ Geçersiz tarih formatı! Lütfen GG.AA.YYYY formatında girin (Örn: 25.12.2024)',
          ephemeral: true
        });
      }

      // Saat formatını kontrol et
      const timePattern = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
      if (!timePattern.test(eventTime)) {
        return await interaction.reply({
          content: '⚠️ Geçersiz saat formatı! Lütfen SS:DD formatında girin (Örn: 21:00)',
          ephemeral: true
        });
      }

      // Tür kontrolü
      const normalizedType = eventType.includes('ozel') || eventType.includes('özel') || eventType === 'private'
        ? 'ozel'
        : 'halka_acik';

      // Halka açık eventler için afiş zorunlu
      if (normalizedType === 'halka_acik' && !eventPoster) {
        return await interaction.reply({
          content: '⚠️ Halka açık eventler için afiş linki zorunludur! Lütfen bir imgur linki ekleyin.',
          ephemeral: true
        });
      }

      // Afiş linki varsa geçerli mi kontrol et
      if (eventPoster && !eventPoster.match(/^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)$/i) && !eventPoster.includes('imgur.com')) {
        return await interaction.reply({
          content: '⚠️ Geçersiz afiş linki! Lütfen geçerli bir resim URL\'si girin (imgur önerilir).',
          ephemeral: true
        });
      }

      // Çakışma kontrolü
      const conflicts = findConflictingEvents(eventDate);

      const eventData = {
        name: eventName,
        date: parsedDate.formatted,
        time: eventTime,
        type: normalizedType,
        poster: eventPoster,
        requestedBy: interaction.user.tag,
        requestedById: interaction.user.id,
        channelId: interaction.channelId,
        guildId: interaction.guildId
      };

      if (conflicts.length > 0) {
        // Çakışma var - kullanıcıya bildir
        const conflictList = conflicts.map(c => `• **${c.name}** - Saat: ${c.time || 'Belirtilmemiş'} (${c.type === 'ozel' ? 'Özel' : 'Halka Açık'})`).join('\n');

        // Event yöneticisi etiketlemesi
        const managerId = process.env.EVENT_MANAGER_ID;
        const managerMention = managerId ? `<@${managerId}>` : 'yetkiliyi';

        const conflictEmbed = new EmbedBuilder()
          .setTitle('📅 Bu Tarihte Zaten Bir Etkinlik Planlanmış!')
          .setDescription(
            `**${parsedDate.formatted}** tarihinde hali hazırda planlanmış etkinlik(ler) bulunuyor:\n\n${conflictList}\n\n` +
            `Yine de bu tarihte etkinlik düzenlemek istiyorsanız, lütfen ${managerMention} etiketleyerek onay alın veya aşağıdaki butonları kullanın.`
          )
          .setColor(0xFFA500)
          .addFields(
            { name: '📌 Sizin Etkinliğiniz', value: eventName, inline: true },
            { name: '📅 Tarih', value: parsedDate.formatted, inline: true },
            { name: '🕐 Saat', value: eventTime, inline: true },
            { name: '🔒 Tür', value: normalizedType === 'ozel' ? 'Özel' : 'Halka Açık', inline: true }
          )
          .setTimestamp();

        // Event verisini base64 olarak encode et (buton ID sınırı nedeniyle)
        const encodedData = Buffer.from(JSON.stringify(eventData)).toString('base64');

        const confirmBtn = new ButtonBuilder()
          .setCustomId(`confirm_event_${encodedData}`)
          .setLabel('✅ Yine de Devam Et')
          .setStyle(ButtonStyle.Success);

        const cancelBtn = new ButtonBuilder()
          .setCustomId('cancel_event_conflict')
          .setLabel('❌ İptal Et')
          .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

        await interaction.reply({
          embeds: [conflictEmbed],
          components: [row]
        });
        return;
      }

      // Çakışma yok - doğrudan kaydet
      eventData.status = 'beklemede';
      const savedEvent = addEvent(eventData);

      if (savedEvent) {
        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Event Talebi Alındı')
          .setDescription('Event talebiniz başarıyla kaydedildi!')
          .addFields(
            { name: '📌 Event Adı', value: eventName, inline: true },
            { name: '📅 Tarih', value: parsedDate.formatted, inline: true },
            { name: '🕐 Saat', value: eventTime, inline: true },
            { name: '🔒 Tür', value: normalizedType === 'ozel' ? 'Özel' : 'Halka Açık', inline: true },
            { name: '📝 Durum', value: 'Beklemede', inline: true }
          )
          .setColor(0x00FF00)
          .setFooter({ text: 'Yetkililer en kısa sürede talebinizi değerlendirecektir.' })
          .setTimestamp();

        if (eventPoster) {
          successEmbed.setImage(eventPoster);
        }

        // Log kanalına bildir
        await logEventRequest(interaction.guild, eventData, interaction.user);

        // Event takvimi kanalına duyuru gönder
        await announceNewEvent(interaction.guild, eventData, interaction.user);

        await interaction.reply({ embeds: [successEmbed] });
      } else {
        await interaction.reply({
          content: '⚠️ Event kaydedilirken bir hata oluştu. Lütfen tekrar deneyin.',
          ephemeral: true
        });
      }
      return;
    }

    // Admin event ekleme modalı
    if (interaction.isModalSubmit() && interaction.customId === 'admin_event_modal') {
      const eventName = interaction.fields.getTextInputValue('event_name');
      const eventDate = interaction.fields.getTextInputValue('event_date');
      const eventTime = interaction.fields.getTextInputValue('event_time');
      const eventType = interaction.fields.getTextInputValue('event_type').toLowerCase();
      const eventPoster = interaction.fields.getTextInputValue('event_poster') || '';

      const parsedDate = parseDate(eventDate);
      if (!parsedDate) {
        return await interaction.reply({
          content: '⚠️ Geçersiz tarih formatı! Lütfen GG.AA.YYYY formatında girin.',
          ephemeral: true
        });
      }

      // Saat formatını kontrol et
      const timePattern = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
      if (!timePattern.test(eventTime)) {
        return await interaction.reply({
          content: '⚠️ Geçersiz saat formatı! Lütfen SS:DD formatında girin (Örn: 21:00)',
          ephemeral: true
        });
      }

      const normalizedType = eventType.includes('ozel') || eventType.includes('özel') ? 'ozel' : 'halka_acik';

      // Halka açık eventler için afiş zorunlu
      if (normalizedType === 'halka_acik' && !eventPoster) {
        return await interaction.reply({
          content: '⚠️ Halka açık eventler için afiş linki zorunludur!',
          ephemeral: true
        });
      }

      const eventData = {
        name: eventName,
        date: parsedDate.formatted,
        time: eventTime,
        type: normalizedType,
        poster: eventPoster,
        requestedBy: interaction.user.tag,
        requestedById: interaction.user.id,
        status: 'onaylandi', // Admin eklediği için otomatik onaylı
        approvedBy: interaction.user.tag
      };

      const savedEvent = addEvent(eventData);

      if (savedEvent) {
        const embed = new EmbedBuilder()
          .setTitle('✅ Event Eklendi')
          .setDescription('Event başarıyla takvime eklendi!')
          .addFields(
            { name: '📌 Event Adı', value: eventName, inline: true },
            { name: '📅 Tarih', value: parsedDate.formatted, inline: true },
            { name: '🕐 Saat', value: eventTime, inline: true },
            { name: '🔒 Tür', value: normalizedType === 'ozel' ? 'Özel' : 'Halka Açık', inline: true }
          )
          .setColor(0x00FF00)
          .setTimestamp();

        if (eventPoster) {
          embed.setImage(eventPoster);
        }

        // Event takvimi kanalına duyuru gönder
        await announceNewEvent(interaction.guild, eventData, interaction.user);

        await interaction.reply({ embeds: [embed], ephemeral: true });
      } else {
        await interaction.reply({
          content: '⚠️ Event kaydedilirken bir hata oluştu.',
          ephemeral: true
        });
      }
      return;
    }

    // İşletme anket modalı
    if (interaction.isModalSubmit() && interaction.customId === 'survey_modal') {
      const a1 = interaction.fields.getTextInputValue('q1') || 'Boş';
      const a2 = interaction.fields.getTextInputValue('q2') || 'Boş';
      const a3 = interaction.fields.getTextInputValue('q3') || 'Boş';

      let logChannel = null;
      if (process.env.TARGET_CHANNEL_ID) {
        try { logChannel = await interaction.guild.channels.fetch(process.env.TARGET_CHANNEL_ID); } catch(_) { logChannel = null; }
      }
      if (!logChannel) {
        logChannel = interaction.guild.channels.cache.find(c => ['long','logs','anket'].includes(c.name.toLowerCase())) || null;
      }

      const embed = new EmbedBuilder()
        .setTitle('Yeni İşletme')
        .setDescription(`**Gönderen:** ${interaction.user.tag} (${interaction.user.id})`)
        .addFields(
          { name: 'İşletme Adı', value: a1.substring(0, 1024), inline: false },
          { name: 'İşletme Türü', value: a2.substring(0, 1024), inline: false },
          { name: 'UCP Adı', value: a3.substring(0, 4096), inline: false }
        )
        .setTimestamp();

      if (logChannel) {
        await logChannel.send({ embeds: [embed] }).catch(err => console.error('Log gönderme hatası:', err));
      } else {
        console.warn('Log kanalı bulunamadı.');
      }

      let role = null;
      if (process.env.ROLE_ID) role = interaction.guild.roles.cache.get(process.env.ROLE_ID) || null;
      if (!role) role = interaction.guild.roles.cache.find(r => ['verified','onaylı','completed'].includes(r.name.toLowerCase())) || null;

      try {
        if (role) {
          const member = await interaction.guild.members.fetch(interaction.user.id);
          await member.roles.add(role);
          await interaction.reply({ content: `✅ Talebini aldık ve senin için bir rol verdik!: ${role.name}`, ephemeral: true });
        } else {
          await interaction.reply({ content: '✅ Talebin alındı. (Rol bulunamadı)', ephemeral: true });
        }
      } catch (err) {
        console.error('Rol verme hatası:', err);
        await interaction.reply({ content: '⚠️ İşletme için rol talebi alındı fakat rol verilemedi (izin sorunu).', ephemeral: true }).catch(() => {});
      }
      return;
    }

  } catch (err) {
    console.error('Interaction handler hatası:', err);
    try {
      if (interaction && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '⚠️ Bir hata oluştu.', ephemeral: true });
      }
    } catch (_) {}
  }
});

// Event talebini log kanalına bildir
async function logEventRequest(guild, eventData, user) {
  try {
    let logChannel = null;

    // EVENT_LOG_CHANNEL_ID varsa onu kullan
    if (process.env.EVENT_LOG_CHANNEL_ID) {
      try {
        logChannel = await guild.channels.fetch(process.env.EVENT_LOG_CHANNEL_ID);
      } catch (_) {}
    }

    // Yoksa TARGET_CHANNEL_ID dene
    if (!logChannel && process.env.TARGET_CHANNEL_ID) {
      try {
        logChannel = await guild.channels.fetch(process.env.TARGET_CHANNEL_ID);
      } catch (_) {}
    }

    // Hala yoksa isimle ara
    if (!logChannel) {
      logChannel = guild.channels.cache.find(c =>
        ['event-log', 'event-logs', 'etkinlik-log', 'logs'].includes(c.name.toLowerCase())
      );
    }

    if (!logChannel) return;

    const embed = new EmbedBuilder()
      .setTitle('📅 Yeni Event Talebi')
      .setDescription(`**${user.tag}** yeni bir event talebi oluşturdu.`)
      .addFields(
        { name: '📌 Event Adı', value: eventData.name, inline: true },
        { name: '📅 Tarih', value: eventData.date, inline: true },
        { name: '🕐 Saat', value: eventData.time || 'Belirtilmemiş', inline: true },
        { name: '🔒 Tür', value: eventData.type === 'ozel' ? 'Özel' : 'Halka Açık', inline: true },
        { name: '📝 Durum', value: eventData.status || 'Beklemede', inline: true },
        { name: '👤 Talep Eden', value: `<@${user.id}>`, inline: true }
      )
      .setColor(0x5865F2)
      .setTimestamp();

    if (eventData.poster) {
      embed.setImage(eventData.poster);
    }

    await logChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Event log gönderme hatası:', err);
  }
}

// Event takvimi kanalına duyuru gönder
async function announceNewEvent(guild, eventData, user) {
  try {
    let announceChannel = null;

    // EVENT_ANNOUNCE_CHANNEL_ID varsa onu kullan
    if (process.env.EVENT_ANNOUNCE_CHANNEL_ID) {
      try {
        announceChannel = await guild.channels.fetch(process.env.EVENT_ANNOUNCE_CHANNEL_ID);
      } catch (_) {}
    }

    // Yoksa isimle ara
    if (!announceChannel) {
      announceChannel = guild.channels.cache.find(c =>
        ['event-takvimi', 'event-takvim', 'etkinlik-takvimi', 'events', 'etkinlikler'].includes(c.name.toLowerCase())
      );
    }

    if (!announceChannel) {
      console.warn('Event duyuru kanalı bulunamadı. EVENT_ANNOUNCE_CHANNEL_ID tanımlayın veya "event-takvimi" adlı kanal oluşturun.');
      return;
    }

    const typeEmoji = eventData.type === 'ozel' ? '🔒 Özel Event' : '🌐 Halka Açık Event';
    const statusText = eventData.status === 'onaylandi' ? '✅ Onaylandı' : '⏳ Onay Bekliyor';

    const embed = new EmbedBuilder()
      .setTitle('🎉 YENİ BİR EVENT EKLENDİ!')
      .setDescription(`**${eventData.name}** takvime eklendi!`)
      .addFields(
        { name: '📅 Tarih', value: eventData.date, inline: true },
        { name: '🕐 Saat', value: eventData.time || 'Belirtilmemiş', inline: true },
        { name: '🎭 Tür', value: typeEmoji, inline: true },
        { name: '📝 Durum', value: statusText, inline: true }
      )
      .setColor(eventData.type === 'ozel' ? 0x9B59B6 : 0x3498DB)
      .setFooter({ text: 'Event Takvimi' })
      .setTimestamp();

    // Halka açık eventler için afiş göster
    if (eventData.poster && eventData.type === 'halka_acik') {
      embed.setImage(eventData.poster);
    }

    await announceChannel.send({ embeds: [embed] });
    console.log(`Event duyurusu gönderildi: ${eventData.name}`);

  } catch (err) {
    console.error('Event duyuru gönderme hatası:', err);
  }
}

client.login(token);
