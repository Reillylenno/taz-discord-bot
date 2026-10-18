import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

const sessions = new Map();

function sessionKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function editorRows(embeds, selected = 0) {
  const slots = Array.from({ length: 10 }, (_, index) => ({
    label: `Embed ${index + 1}${embeds[index] ? " (saved)" : ""}`,
    value: String(index),
    default: index === selected,
  }));
  return [
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId("embed-tool:select")
      .setPlaceholder("Choose an embed slot")
      .addOptions(slots)),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("embed-tool:edit").setLabel("Edit selected").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("embed-tool:preview").setLabel("Preview").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("embed-tool:send").setLabel("Send all embeds").setStyle(ButtonStyle.Success),
    ),
  ];
}

function createModal(guildId, userId, index, embedData = {}) {
  const modal = new ModalBuilder()
    .setCustomId(`embed-tool:modal:${guildId}:${userId}:${index}`)
    .setTitle(`Edit embed ${index + 1}`);
  const inputs = [
    ["title", "Title", TextInputStyle.Short, embedData.title ?? "", 256],
    ["description", "Description", TextInputStyle.Paragraph, embedData.description ?? "", 4000],
    ["color", "Six-digit hex color", TextInputStyle.Short, embedData.color ? `#${embedData.color.toString(16).padStart(6, "0")}` : "#5865F2", 7],
    ["image", "Image URL", TextInputStyle.Short, embedData.image?.url ?? "", 2048],
    ["footer", "Footer text", TextInputStyle.Short, embedData.footer?.text ?? "", 2048],
  ];
  modal.addComponents(inputs.map(([id, label, style, value, maxLength]) => {
    const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(false).setMaxLength(maxLength);
    if (value) input.setValue(value);
    return new ActionRowBuilder().addComponents(input);
  }));
  return modal;
}

function validChannelPermissions(channel, botMember, permissionSet) {
  return channel?.isTextBased() && channel.permissionsFor(botMember)?.has(permissionSet);
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function openEditor(interaction, { channel, message, embeds }) {
  const state = {
    channelId: channel.id,
    messageId: message?.id ?? null,
    embeds: embeds.slice(0, 10),
    selected: 0,
  };
  sessions.set(sessionKey(interaction.guildId, interaction.user.id), state);
  await interaction.editReply({
    content: `Embed editor for <#${channel.id}>. Choose a slot to edit, preview the embeds, or send them all.`,
    components: editorRows(state.embeds),
  });
}

export async function executeSendEmbed(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const channel = interaction.options.getChannel("channel", true);
  const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
  const permissions = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
  if (!validChannelPermissions(channel, botMember, permissions)) {
    await interaction.editReply("I need View Channel, Send Messages, and Embed Links permissions in the target channel.");
    return;
  }

  const key = sessionKey(interaction.guildId, interaction.user.id);
  let state = sessions.get(key);
  const messageId = interaction.options.getString("message_id");
  let message = null;
  let embeds = [];
  if (messageId) {
    message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message || message.author.id !== interaction.client.user.id) {
      await interaction.editReply("I can only edit a message authored by this bot.");
      return;
    }
    embeds = message.embeds.map((embed) => embed.toJSON());
  } else if (state?.channelId === channel.id) {
    embeds = state.embeds;
  }

  const sendNow = interaction.options.getBoolean("send_now") ?? false;
  if (sendNow) {
    if (embeds.length === 0) {
      await interaction.editReply("There are no saved embeds to send. Run /sendembed without send_now to open the editor first.");
      return;
    }
    if (message) {
      await message.edit({ embeds: embeds.slice(0, 10) });
      await interaction.editReply("Saved embeds applied to the selected message.");
    } else {
      await channel.send({ embeds: embeds.slice(0, 10) });
      await interaction.editReply(`Sent ${embeds.length} embed(s) to <#${channel.id}>.`);
    }
    return;
  }
  await openEditor(interaction, { channel, message, embeds });
}

export async function executeEditEmbed(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const channel = interaction.options.getChannel("channel", true);
  const messageId = interaction.options.getString("message_id", true);
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message || message.author.id !== interaction.client.user.id) {
    await interaction.editReply("I can only edit a message authored by this bot.");
    return;
  }
  const rawEmbeds = message.embeds.map((embed) => embed.toJSON());
  const resendTo = interaction.options.getChannel("resend_to");
  const fields = ["title", "description", "color", "image_url", "thumbnail_url", "footer", "footer_icon_url", "author_name", "author_icon_url"];
  const hasQuickEdit = fields.some((field) => interaction.options.getString(field) !== null);
  if (!hasQuickEdit && !resendTo) {
    await openEditor(interaction, { channel, message, embeds: rawEmbeds });
    return;
  }

  const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
  const destination = resendTo ?? channel;
  if (!validChannelPermissions(destination, botMember, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    await interaction.editReply("I need View Channel, Send Messages, and Embed Links permissions in the destination channel.");
    return;
  }
  const embeds = rawEmbeds.map((raw) => EmbedBuilder.from(raw));
  if (resendTo && embeds.length === 0) {
    await interaction.editReply("That message has no embeds to copy.");
    return;
  }
  if (hasQuickEdit) {
    const embed = embeds[0] ?? new EmbedBuilder();
    const title = interaction.options.getString("title");
    const description = interaction.options.getString("description");
    const color = interaction.options.getString("color");
    const image = interaction.options.getString("image_url");
    const thumbnail = interaction.options.getString("thumbnail_url");
    const footer = interaction.options.getString("footer");
    const footerIcon = interaction.options.getString("footer_icon_url");
    const author = interaction.options.getString("author_name");
    const authorIcon = interaction.options.getString("author_icon_url");
    if (color && !/^#?[0-9a-fA-F]{6}$/.test(color)) {
      await interaction.editReply("Color must be a six-digit hex value.");
      return;
    }
    for (const [label, url] of [["Image", image], ["Thumbnail", thumbnail], ["Footer icon", footerIcon], ["Author icon", authorIcon]]) {
      if (url && !isHttpUrl(url)) {
        await interaction.editReply(`${label} URL must be a valid HTTP or HTTPS URL.`);
        return;
      }
    }
    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (color) embed.setColor(Number.parseInt(color.replace(/^#/, ""), 16));
    if (image) embed.setImage(image);
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (footer) embed.setFooter({ text: footer, ...(footerIcon ? { iconURL: footerIcon } : {}) });
    if (author) embed.setAuthor({ name: author, ...(authorIcon ? { iconURL: authorIcon } : {}) });
    if (embeds.length) embeds[0] = embed;
    else embeds.push(embed);
  }
  if (resendTo) {
    await destination.send({ embeds: embeds.slice(0, 10) });
    await interaction.editReply(`Copied ${embeds.length} embed(s) to <#${destination.id}>.`);
  } else {
    await message.edit({ embeds: embeds.slice(0, 10) });
    await interaction.editReply("Embed message updated.");
  }
}

async function saveModal(interaction) {
  const [, , guildId, userId, indexText] = interaction.customId.split(":");
  const state = sessions.get(sessionKey(guildId, userId));
  if (interaction.guildId !== guildId || interaction.user.id !== userId || !state) {
    await interaction.reply({ content: "This embed editor expired. Run the command again.", flags: MessageFlags.Ephemeral });
    return;
  }
  const title = interaction.fields.getTextInputValue("title").trim();
  const description = interaction.fields.getTextInputValue("description").trim();
  const color = interaction.fields.getTextInputValue("color").trim() || "#5865F2";
  const image = interaction.fields.getTextInputValue("image").trim();
  const footer = interaction.fields.getTextInputValue("footer").trim();
  if (!title && !description) {
    await interaction.reply({ content: "An embed needs a title or description.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!/^#?[0-9a-fA-F]{6}$/.test(color)) {
    await interaction.reply({ content: "Color must be a six-digit hex value.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (image) {
    try {
      const url = new URL(image);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Invalid protocol");
    } catch {
      await interaction.reply({ content: "Image URL must be a valid HTTP or HTTPS URL.", flags: MessageFlags.Ephemeral });
      return;
    }
  }

  const index = Number(indexText);
  const embed = state.embeds[index] ? EmbedBuilder.from(state.embeds[index]) : new EmbedBuilder();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  embed.setColor(Number.parseInt(color.replace(/^#/, ""), 16));
  if (image) embed.setImage(image);
  if (footer) embed.setFooter({ text: footer });
  state.embeds[index] = embed.toJSON();
  sessions.set(sessionKey(guildId, userId), state);
  await interaction.reply({ content: `Saved embed ${index + 1}.`, flags: MessageFlags.Ephemeral });
}

export async function handleEmbedToolComponent(interaction) {
  if (!interaction.customId?.startsWith("embed-tool:")) return false;
  if (interaction.isModalSubmit() && interaction.customId.startsWith("embed-tool:modal:")) {
    await saveModal(interaction);
    return true;
  }
  const key = sessionKey(interaction.guildId, interaction.user.id);
  const state = sessions.get(key);
  if (!state) {
    await interaction.reply({ content: "This embed editor expired. Run the command again.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (interaction.isStringSelectMenu() && interaction.customId === "embed-tool:select") {
    state.selected = Number(interaction.values[0]);
    sessions.set(key, state);
    await interaction.update({ content: `Selected embed ${state.selected + 1}.`, components: editorRows(state.embeds, state.selected) });
    return true;
  }
  if (!interaction.isButton()) return false;
  if (interaction.customId === "embed-tool:edit") {
    await interaction.showModal(createModal(interaction.guildId, interaction.user.id, state.selected, state.embeds[state.selected]));
    return true;
  }
  if (interaction.customId === "embed-tool:preview") {
    const embeds = state.embeds.map((raw) => EmbedBuilder.from(raw));
    if (!embeds.length) {
      await interaction.reply({ content: "No embeds have been saved yet.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds });
    return true;
  }
  if (interaction.customId === "embed-tool:send") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = await interaction.guild.channels.fetch(state.channelId);
    const embeds = state.embeds.map((raw) => EmbedBuilder.from(raw));
    if (!embeds.length) {
      await interaction.editReply("No embeds have been saved yet.");
      return true;
    }
    if (state.messageId) {
      const message = await channel.messages.fetch(state.messageId);
      await message.edit({ embeds });
      await interaction.editReply("Embed message updated.");
    } else {
      await channel.send({ embeds });
      await interaction.editReply(`Sent ${embeds.length} embed(s) to <#${channel.id}>.`);
    }
    return true;
  }
  return false;
}