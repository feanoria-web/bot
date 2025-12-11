// log ve anket için
require('dotenv').config();

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
  EmbedBuilder
} = require('discord.js');

const token = process.env.TOKEN || process.env.DISCORD_TOKEN || (process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN.trim());
if (!token) {
  console.error('Hata: TOKEN bulunamadı. .env içinde TOKEN veya DISCORD_TOKEN tanımlı olmalı.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

// tanerze der ki; naber baran
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection:', reason, p);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

client.once(Events.ClientReady, () => {
  console.log(`${client.user.tag} olarak giriş yapıldı.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // anketi yollamak için "/anketiyolla"
if (interaction.isCommand() && interaction.commandName === 'anketiyolla') {
  // rol kontrol
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const authorizedRoleId = process.env.AUTHORIZED_ROLE_ID;
  
  if (!member.roles.cache.has(authorizedRoleId)) {
    return await interaction.reply({
      content: '⚠️ Bu komutu kullanmak için yetkiniz yok.',
      ephemeral: true
    });
  }
      // butonlar
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

      // butonların gideceği kanal
      const formChannelId = (process.env.FORM_CHANNEL_ID && process.env.FORM_CHANNEL_ID.trim()) ||
                            (process.env.TARGET_CHANNEL_ID && process.env.TARGET_CHANNEL_ID.trim()) ||
                            interaction.channelId;

      let formChannel = null;
      try {
        formChannel = await interaction.guild.channels.fetch(formChannelId);
      } catch (_) { formChannel = null; }
      if (!formChannel) formChannel = interaction.channel;

      // botun mesajı
      const embed = new EmbedBuilder()
        .setTitle('İşletme Bildirimi')
        .setDescription('Herhangi bir işletme sahibiysen bu butona tıkla!')
        .setImage('https://i.imgur.com/1CWr56F.png') // buraya kendi fotoğraf linkini koy
        .setColor(0x00AE86);

      try {
        await formChannel.send({ embeds: [embed], components: [row] });
      } catch (err) {
        console.error('Form kanalına mesaj gönderilemedi, fallback olarak komut kanalına gönderiliyor:', err);
        try {
          await interaction.channel.send({
            content: 'Herhangi bir işletme sahibiysen bu butona tıkla!',
            components: [row]
          });
        } catch (_) {}
      }

      // sadece komutu kullanan kişiye
      await interaction.reply({ content: '✅ İşletmeler için anket butonu hedef kanala gönderildi.', ephemeral: true });
      return;
    }

    // butona tıklayınca anket kısmını aç
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

    // rolü kaldıran buton
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

    // model
    if (interaction.isModalSubmit() && interaction.customId === 'survey_modal') {
      const a1 = interaction.fields.getTextInputValue('q1') || 'Boş';
      const a2 = interaction.fields.getTextInputValue('q2') || 'Boş';
      const a3 = interaction.fields.getTextInputValue('q3') || 'Boş';

      // log kanalı
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
        console.warn('Log kanalı bulunamadı. TARGET_CHANNEL_ID .env ekle veya "long" adlı kanal oluştur.');
      }

      // rolü ver
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
        try {
          await interaction.reply({ content: '⚠️ İşletme için rol talebi alındı fakat rol verilemedi (izin sorunu).', ephemeral: true });
        } catch (_) {}
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

client.login(token);
