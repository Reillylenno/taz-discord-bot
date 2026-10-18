import {
  ActionRowBuilder,
  AttachmentBuilder,
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
import {
  defaultTicketSettings,
  getTicketSettings,
  updateTicketSettings,
} from "./ticket-store.js";
import { hasCommandAccess } from "./command-access.js";

const buttonStyles = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};
const openings = new Set();
const editorSelections = new Map();
const ticketPermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
];

function isValidHexColor(color) {
  return /^#?[0-9a-fA-F]{6}$/.test(color);
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function replaceTicketTokens(value, guild, user) {
  return value
    .replaceAll("{user}", `<@${user.id}>`)
    .replaceAll("{username}", user.username)
    .replaceAll("{server}", guild.name);
}

function makePanelEmbeds(settings) {
  const slots = settings.panelEmbeds.filter((slot) => slot && (slot.title || slot.description));
  if (slots.length === 0) {
    return [new EmbedBuilder()
      .setColor(0x00aaff)
      .setTitle("Support Tickets")
      .setDescription("Click the button below to open a private support ticket.")];
  }

  return slots.slice(0, 10).map((slot) => {
    const embed = new EmbedBuilder().setColor(Number.parseInt((slot.color ?? "#00AAFF").replace(/^#/, ""), 16));
    if (slot.title) embed.setTitle(slot.title);
    if (slot.description) embed.setDescription(slot.description);
    if (slot.imageUrl) embed.setImage(slot.imageUrl);
    if (slot.footer) embed.setFooter({ text: slot.footer });
    return embed;
  });
}

function makeTicketEmbed(settings, guild, user) {
  const config = settings.ticketEmbed;
  const embed = new EmbedBuilder()
    .setColor(Number.parseInt(config.color.replace(/^#/, ""), 16))
    .setTitle(replaceTicketTokens(config.title, guild, user))
    .setDescription(replaceTicketTokens(config.description, guild, user));
  if (config.footer) embed.setFooter({ text: replaceTicketTokens(config.footer, guild, user) });
  if (config.imageUrl) embed.setImage(config.imageUrl);
  if (config.fields.length > 0) {
    embed.addFields(config.fields.map((field) => ({
      name: replaceTicketTokens(field.name, guild, user),
      value: replaceTicketTokens(field.value, guild, user),
      inline: field.inline,
    })));
  }
  return embed;
}

function panelComponents(settings) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:open")
      .setLabel(settings.buttonLabel)
      .setStyle(buttonStyles[settings.buttonStyle] ?? ButtonStyle.Primary),
  )];
}

async function publishPanel(guild, settings) {
  if (!settings.panelChannelId) throw new Error("Set a panel channel first with /ticket setpanel.");
  if (!settings.categoryId) throw new Error("Set a ticket category first with /ticket setcategory.");
  if (!settings.staffRoleId) throw new Error("Set a staff role first with /ticket setstaff.");

  const channel = await guild.channels.fetch(settings.panelChannelId);
  if (!channel?.isTextBased() || channel.guildId !== guild.id) {
    throw new Error("The configured panel channel is unavailable or is not a text channel.");
  }

  let panelMessage;
  if (settings.panelMessageId) {
    try {
      panelMessage = await channel.messages.fetch(settings.panelMessageId);
      if (panelMessage.author.id !== guild.client.user.id) panelMessage = null;
    } catch {
      panelMessage = null;
    }
  }

  const messageOptions = {
    embeds: makePanelEmbeds(settings),
    components: panelComponents(settings),
    allowedMentions: { parse: [] },
  };

  if (panelMessage) {
    await panelMessage.edit(messageOptions);
  } else {
    panelMessage = await channel.send(messageOptions);
    settings = await updateTicketSettings(guild.id, (current) => ({
      ...current,
      panelMessageId: panelMessage.id,
    }));
  }
  return { channel, message: panelMessage, settings };
}

async function deletePanelMessages(guild, panelChannelId) {
  if (!panelChannelId) return 0;
  const channel = await guild.channels.fetch(panelChannelId);
  if (!channel?.isTextBased() || channel.guildId !== guild.id) return 0;

  let deleted = 0;
  let before;
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (batch.size === 0) break;
    before = batch.last().id;

    for (const message of batch.values()) {
      if (message.author.id !== guild.client.user.id) continue;
      try {
        await message.delete();
        deleted += 1;
      } catch (error) {
        console.error(`Could not delete panel message ${message.id}:`, error);
      }
    }
    if (batch.size < 100) break;
  }
  return deleted;
}

function editorComponents(selectedSlot = 0) {
  const select = new StringSelectMenuBuilder()
    .setCustomId("ticket:editor:select")
    .setPlaceholder("Select an embed slot")
    .addOptions(Array.from({ length: 10 }, (_, index) => ({
      label: `Embed slot ${index + 1}`,
      value: String(index),
      default: index === selectedSlot,
    })));

  return [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ticket:editor:edit").setLabel("Edit selected slot").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("ticket:editor:preview").setLabel("Preview").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("ticket:editor:publish").setLabel("Send to panel").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("ticket:editor:clear").setLabel("Clear panel embeds").setStyle(ButtonStyle.Danger),
    ),
  ];
}

function resetConfirmationRow(action, userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:confirm:${action}:${userId}`)
      .setLabel("Confirm reset")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ticket:cancel:${userId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );
}

function optionString(interaction, name) {
  return interaction.options.getString(name);
}

export async function handleTicketCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = interaction.guild;
  if (!await hasCommandAccess(interaction, "ticket", PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply("You need Manage Server permission or delegated /ticket access.");
    return;
  }
  const settings = await getTicketSettings(guild.id);

  if (subcommand === "setpanel") {
    const channel = interaction.options.getChannel("channel", true);
    if (!channel.isTextBased() || channel.guildId !== guild.id) {
      await interaction.editReply("Choose a text channel in this server.");
      return;
    }
    const botMember = guild.members.me ?? await guild.members.fetchMe();
    if (!channel.permissionsFor(botMember)?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ])) {
      await interaction.editReply("I need View Channel, Send Messages, and Embed Links permissions in that channel.");
      return;
    }
    await updateTicketSettings(guild.id, (current) => ({ ...current, panelChannelId: channel.id, panelMessageId: null }));
    await interaction.editReply(`Ticket panel channel set to <#${channel.id}>. Run /ticket publish to post the panel.`);
    return;
  }

  if (subcommand === "setcategory") {
    const category = interaction.options.getChannel("category", true);
    if (category.type !== ChannelType.GuildCategory || category.guildId !== guild.id) {
      await interaction.editReply("Choose a category in this server.");
      return;
    }
    await updateTicketSettings(guild.id, (current) => ({ ...current, categoryId: category.id }));
    await interaction.editReply(`New tickets will be created in **${category.name}**.`);
    return;
  }

  if (subcommand === "setstaff") {
    const role = interaction.options.getRole("role", true);
    if (role.id === guild.id) {
      await interaction.editReply("Choose a staff role other than @everyone.");
      return;
    }
    await updateTicketSettings(guild.id, (current) => ({ ...current, staffRoleId: role.id }));
    await interaction.editReply(`Ticket staff role set to <@&${role.id}>.`);
    return;
  }

  if (subcommand === "settranscript") {
    const channel = interaction.options.getChannel("channel", true);
    if (!channel.isTextBased() || channel.guildId !== guild.id) {
      await interaction.editReply("Choose a text channel in this server.");
      return;
    }
    const botMember = guild.members.me ?? await guild.members.fetchMe();
    if (!channel.permissionsFor(botMember)?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.AttachFiles,
    ])) {
      await interaction.editReply("I need View Channel, Send Messages, and Attach Files permissions in that channel.");
      return;
    }
    await updateTicketSettings(guild.id, (current) => ({ ...current, transcriptChannelId: channel.id }));
    await interaction.editReply(`Ticket transcripts will be sent to <#${channel.id}>.`);
    return;
  }

  if (subcommand === "editembeds") {
    const channel = interaction.options.getChannel("channel", true);
    if (!channel.isTextBased() || channel.guildId !== guild.id) {
      await interaction.editReply("Choose a text channel in this server.");
      return;
    }
    const botMember = guild.members.me ?? await guild.members.fetchMe();
    if (!channel.permissionsFor(botMember)?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ])) {
      await interaction.editReply("I need View Channel, Send Messages, and Embed Links permissions in that channel.");
      return;
    }
    await updateTicketSettings(guild.id, (current) => ({ ...current, panelChannelId: channel.id }));
    editorSelections.set(`${guild.id}:${interaction.user.id}`, 0);
    await interaction.editReply({
      content: `Panel embed editor for <#${channel.id}>. Select a slot, edit it, preview, publish, or clear the panel embeds.`,
      components: editorComponents(),
    });
    return;
  }

  if (subcommand === "editpanel") {
    const label = optionString(interaction, "button_label");
    const style = optionString(interaction, "button_style");
    const updated = await updateTicketSettings(guild.id, (current) => ({
      ...current,
      ...(label !== null ? { buttonLabel: label } : {}),
      ...(style !== null ? { buttonStyle: style } : {}),
    }));
    let message = `Ticket button settings saved: **${updated.buttonLabel}** (${updated.buttonStyle}).`;
    if (updated.panelChannelId) {
      try {
        await publishPanel(guild, updated);
        message += " The panel was updated.";
      } catch (error) {
        message += ` Settings saved, but the panel could not be updated: ${error.message}`;
      }
    }
    await interaction.editReply(message);
    return;
  }

  if (subcommand === "editticket") {
    const title = optionString(interaction, "title");
    const description = optionString(interaction, "description");
    const footer = optionString(interaction, "footer");
    const color = optionString(interaction, "color");
    const imageUrl = optionString(interaction, "image_url");
    if (color !== null && !isValidHexColor(color)) {
      await interaction.editReply("Color must be a six-digit hex value, such as #00ff00.");
      return;
    }
    if (imageUrl && !isHttpUrl(imageUrl)) {
      await interaction.editReply("Image URL must be a valid HTTP or HTTPS URL.");
      return;
    }

    const updatedTicketEmbed = {
      ...settings.ticketEmbed,
      ...(title !== null ? { title } : {}),
      ...(description !== null ? { description } : {}),
      ...(footer !== null ? { footer } : {}),
      ...(color !== null ? { color } : {}),
      ...(imageUrl !== null ? { imageUrl } : {}),
    };
    const fields = [...updatedTicketEmbed.fields];
    for (let index = 1; index <= 3; index += 1) {
      const name = optionString(interaction, `ticket_field${index}_name`);
      const value = optionString(interaction, `ticket_field${index}_value`);
      const inline = interaction.options.getBoolean(`ticket_field${index}_inline`);
      const existing = fields[index - 1];
      if (name === null && value === null && inline === null) continue;
      const nextName = name ?? existing?.name;
      const nextValue = value ?? existing?.value;
      if (!nextName || !nextValue) {
        await interaction.editReply(`Provide both a name and value for ticket field ${index}.`);
        return;
      }
      if (nextName.length > 256 || nextValue.length > 1024) {
        await interaction.editReply(`Ticket field ${index} exceeds Discord's name or value limit.`);
        return;
      }
      fields[index - 1] = { name: nextName, value: nextValue, inline: inline ?? existing?.inline ?? false };
    }
    fields.splice(0, fields.length, ...fields.filter(Boolean));
    updatedTicketEmbed.fields = fields;
    await updateTicketSettings(guild.id, (current) => ({ ...current, ticketEmbed: updatedTicketEmbed }));
    await interaction.editReply("Ticket welcome embed saved. It will be used in newly opened tickets.");
    return;
  }

  if (subcommand === "publish") {
    try {
      const result = await publishPanel(guild, settings);
      await interaction.editReply(`Ticket panel published in <#${result.channel.id}>.`);
    } catch (error) {
      await interaction.editReply(error.message);
    }
    return;
  }

  if (subcommand === "clearpanels" || subcommand === "resetembed") {
    const action = subcommand === "clearpanels" ? "clearpanels" : "resetembed";
    await interaction.editReply({
      content: subcommand === "clearpanels"
        ? "This removes bot-authored messages from the panel channel and clears all saved ticket configuration, embed settings, and open-ticket records. Existing ticket channels will not be deleted. Confirm?"
        : "This removes bot-authored panel messages and resets panel and ticket embeds, while preserving channel, category, staff role, transcript, and open-ticket settings. Confirm?",
      components: [resetConfirmationRow(action, interaction.user.id)],
    });
    return;
  }

  if (subcommand === "status") {
    const status = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Ticket Configuration")
      .addFields(
        { name: "Panel channel", value: settings.panelChannelId ? `<#${settings.panelChannelId}>` : "Not set", inline: true },
        { name: "Ticket category", value: settings.categoryId ? `<#${settings.categoryId}>` : "Not set", inline: true },
        { name: "Staff role", value: settings.staffRoleId ? `<@&${settings.staffRoleId}>` : "Not set", inline: true },
        { name: "Transcript channel", value: settings.transcriptChannelId ? `<#${settings.transcriptChannelId}>` : "Not set", inline: true },
        { name: "Panel message ID", value: settings.panelMessageId ?? "Not published", inline: true },
        { name: "Button", value: `${settings.buttonLabel} (${settings.buttonStyle})`, inline: true },
        { name: "Panel embeds", value: String(settings.panelEmbeds.length), inline: true },
        { name: "Open tickets", value: String(Object.keys(settings.openTickets).length), inline: true },
      );
    await interaction.editReply({ embeds: [status] });
  }
}

function editorModal(guildId, userId, index, slot = {}) {
  const modal = new ModalBuilder()
    .setCustomId(`ticket:editor:modal:${guildId}:${userId}:${index}`)
    .setTitle(`Edit panel embed slot ${index + 1}`);
  const inputs = [
    ["title", "Title", TextInputStyle.Short, slot.title ?? "", false, 256],
    ["description", "Description", TextInputStyle.Paragraph, slot.description ?? "", false, 4000],
    ["color", "Hex color", TextInputStyle.Short, slot.color ?? "#00AAFF", false, 7],
    ["image", "Image URL (optional)", TextInputStyle.Short, slot.imageUrl ?? "", false, 2048],
    ["footer", "Footer (optional)", TextInputStyle.Short, slot.footer ?? "", false, 2048],
  ];
  modal.addComponents(inputs.map(([id, label, style, value, required, maxLength]) => {
    const input = new TextInputBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setStyle(style)
        .setRequired(required)
        .setMaxLength(maxLength);
    if (value) input.setValue(value);
    return new ActionRowBuilder().addComponents(input);
  }));
  return modal;
}

async function handleEditorButton(interaction) {
  const key = `${interaction.guildId}:${interaction.user.id}`;
  const index = editorSelections.get(key) ?? 0;
  const settings = await getTicketSettings(interaction.guildId);

  if (interaction.customId === "ticket:editor:edit") {
    await interaction.showModal(editorModal(interaction.guildId, interaction.user.id, index, settings.panelEmbeds[index]));
    return;
  }
  if (interaction.customId === "ticket:editor:preview") {
    const embeds = makePanelEmbeds(settings);
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds, allowedMentions: { parse: [] } });
    return;
  }
  if (interaction.customId === "ticket:editor:publish") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const result = await publishPanel(interaction.guild, settings);
      await interaction.editReply(`Ticket panel sent to <#${result.channel.id}>.`);
    } catch (error) {
      await interaction.editReply(error.message);
    }
    return;
  }
  if (interaction.customId === "ticket:editor:clear") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const updated = await updateTicketSettings(interaction.guildId, (current) => ({ ...current, panelEmbeds: [] }));
    if (updated.panelChannelId && updated.panelMessageId) {
      try {
        const channel = await interaction.guild.channels.fetch(updated.panelChannelId);
        const message = await channel.messages.fetch(updated.panelMessageId);
        if (message.author.id === interaction.client.user.id) await message.edit({ embeds: [] });
      } catch (error) {
        console.error("Could not clear published ticket panel embeds:", error);
      }
    }
    await interaction.editReply("Saved panel embeds cleared. The ticket button remains available.");
  }
}

async function openTicket(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = interaction.guild;
  const member = await guild.members.fetch(interaction.user.id);
  const settings = await getTicketSettings(guild.id);

  if (!settings.categoryId || !settings.staffRoleId) {
    await interaction.editReply("Tickets are not fully configured yet. Ask a server manager to set the category and staff role.");
    return;
  }

  const existingId = settings.openTickets[member.id]?.channelId;
  if (existingId) {
    const existing = await guild.channels.fetch(existingId).catch(() => null);
    if (existing) {
      await interaction.editReply(`You already have an open ticket: <#${existing.id}>.`);
      return;
    }
    await updateTicketSettings(guild.id, (current) => {
      const openTickets = { ...current.openTickets };
      delete openTickets[member.id];
      return { ...current, openTickets };
    });
  }

  const openingKey = `${guild.id}:${member.id}`;
  if (openings.has(openingKey)) {
    await interaction.editReply("Your ticket is already being created.");
    return;
  }
  openings.add(openingKey);

  let ticketChannel;
  try {
    const botMember = guild.members.me ?? await guild.members.fetchMe();
    const role = await guild.roles.fetch(settings.staffRoleId);
    if (!role) throw new Error("The configured ticket staff role no longer exists.");

    const safeName = member.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 70) || "member";
    ticketChannel = await guild.channels.create({
      name: `ticket-${safeName}`,
      type: ChannelType.GuildText,
      parent: settings.categoryId,
      topic: `Support ticket opened by ${member.user.tag} (${member.id})`,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: member.id, allow: [...ticketPermissions, PermissionFlagsBits.AttachFiles] },
        { id: role.id, allow: [...ticketPermissions, PermissionFlagsBits.AttachFiles] },
        { id: botMember.id, allow: [...ticketPermissions, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels] },
      ],
    });

    await updateTicketSettings(guild.id, (current) => ({
      ...current,
      openTickets: {
        ...current.openTickets,
        [member.id]: { channelId: ticketChannel.id, openedAt: new Date().toISOString() },
      },
    }));

    await ticketChannel.send({
      content: `<@${member.id}> <@&${role.id}>`,
      embeds: [makeTicketEmbed(settings, guild, member.user)],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket:close").setLabel("Close ticket").setStyle(ButtonStyle.Danger),
      )],
      allowedMentions: { users: [member.id], roles: [role.id] },
    });
    await interaction.editReply(`Your private ticket is ready: <#${ticketChannel.id}>.`);
  } catch (error) {
    console.error("Could not create ticket:", error);
    if (ticketChannel) await ticketChannel.delete("Ticket creation failed").catch(() => {});
    await updateTicketSettings(guild.id, (current) => {
      const openTickets = { ...current.openTickets };
      delete openTickets[member.id];
      return { ...current, openTickets };
    }).catch(() => {});
    await interaction.editReply(`I couldn't create your ticket: ${error.message}`);
  } finally {
    openings.delete(openingKey);
  }
}

async function closeTicket(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const channel = interaction.channel;
  const guild = interaction.guild;
  const settings = await getTicketSettings(guild.id);
  const ticketEntry = Object.entries(settings.openTickets).find(([, ticket]) => ticket.channelId === channel.id);
  if (!ticketEntry) {
    await interaction.editReply("This channel isn't recorded as an open ticket.");
    return;
  }

  const [ownerId] = ticketEntry;
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const isStaff = member?.roles.cache.has(settings.staffRoleId)
    || interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
  if (interaction.user.id !== ownerId && !isStaff) {
    await interaction.editReply("Only the ticket opener or ticket staff can close this ticket.");
    return;
  }

  const opener = await interaction.client.users.fetch(ownerId).catch(() => null);
  if (settings.transcriptChannelId) {
    try {
      const messages = [];
      let before;
      while (true) {
        const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        if (batch.size === 0) break;
        messages.push(...batch.values());
        before = batch.last().id;
        if (batch.size < 100) break;
      }
      const lines = messages.reverse().map((message) => {
        const timestamp = message.createdAt.toISOString();
        const attachments = [...message.attachments.values()].map((attachment) => attachment.url).join(" ");
        return `[${timestamp}] ${message.author.tag}: ${message.cleanContent}${attachments ? ` [Attachments: ${attachments}]` : ""}`;
      });
      const transcript = new AttachmentBuilder(Buffer.from(lines.join("\n") || "No messages.", "utf8"), {
        name: `transcript-${channel.id}.txt`,
      });
      const transcriptChannel = await guild.channels.fetch(settings.transcriptChannelId);
      if (transcriptChannel?.isTextBased()) {
        await transcriptChannel.send({
          content: `Transcript for **${channel.name}**, opened by ${opener?.tag ?? ownerId}, closed by ${interaction.user.tag}.`,
          files: [transcript],
          allowedMentions: { parse: [] },
        });
      }
    } catch (error) {
      console.error(`Could not create ticket transcript for ${channel.id}:`, error);
    }
  }

  await updateTicketSettings(guild.id, (current) => {
    const openTickets = { ...current.openTickets };
    delete openTickets[ownerId];
    return { ...current, openTickets };
  });
  await interaction.editReply("Ticket closed. This channel will now be deleted.");
  await channel.delete(`Ticket closed by ${interaction.user.tag}`);
}

async function savePanelEditorModal(interaction) {
  const [, , , guildId, userId, indexText] = interaction.customId.split(":");
  if (interaction.guildId !== guildId || interaction.user.id !== userId) {
    await interaction.reply({ content: "This editor belongs to another user or server.", flags: MessageFlags.Ephemeral });
    return;
  }

  const title = interaction.fields.getTextInputValue("title").trim();
  const description = interaction.fields.getTextInputValue("description").trim();
  const color = interaction.fields.getTextInputValue("color").trim() || "#00AAFF";
  const imageUrl = interaction.fields.getTextInputValue("image").trim();
  const footer = interaction.fields.getTextInputValue("footer").trim();
  if (!title && !description) {
    await interaction.reply({ content: "An embed needs a title or description.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!isValidHexColor(color)) {
    await interaction.reply({ content: "Color must be a six-digit hex value, such as #00ff00.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (imageUrl && !isHttpUrl(imageUrl)) {
    await interaction.reply({ content: "Image URL must be a valid HTTP or HTTPS URL.", flags: MessageFlags.Ephemeral });
    return;
  }

  const index = Number(indexText);
  const updated = await updateTicketSettings(guildId, (current) => {
    const panelEmbeds = [...current.panelEmbeds];
    panelEmbeds[index] = { title, description, color, imageUrl, footer };
    return { ...current, panelEmbeds };
  });
  await interaction.reply({
    content: `Saved panel embed slot ${index + 1}. There are ${updated.panelEmbeds.filter(Boolean).length} configured slots.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleConfirmation(interaction, action, requesterId) {
  if (interaction.user.id !== requesterId) {
    await interaction.reply({ content: "Only the person who started this reset can confirm it.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferUpdate();
  const settings = await getTicketSettings(interaction.guildId);
  let deleted = 0;
  try {
    deleted = await deletePanelMessages(interaction.guild, settings.panelChannelId);
  } catch (error) {
    console.error("Could not remove ticket panel messages:", error);
  }

  await updateTicketSettings(interaction.guildId, (current) => action === "clearpanels"
    ? {
      ...defaultTicketSettings,
      ticketEmbed: { ...defaultTicketSettings.ticketEmbed },
      panelEmbeds: [],
      openTickets: {},
    }
    : {
      ...current,
      panelMessageId: null,
      panelEmbeds: [],
      ticketEmbed: { ...defaultTicketSettings.ticketEmbed },
    });

  const result = action === "clearpanels"
    ? `Ticket configuration reset. Removed ${deleted} bot-authored panel messages and cleared saved open-ticket records. Existing ticket channels were left untouched.`
    : `Ticket embeds reset. Removed ${deleted} bot-authored panel messages; channel, category, staff role, transcript destination, and open-ticket records were preserved.`;
  await interaction.editReply({ content: result, components: [] });
}

export async function handleTicketComponent(interaction) {
  if (!interaction.customId?.startsWith("ticket:")) return false;

  if (interaction.isButton()) {
    if (interaction.customId === "ticket:open") {
      await openTicket(interaction);
      return true;
    }
    if (interaction.customId === "ticket:close") {
      await closeTicket(interaction);
      return true;
    }
    if (interaction.customId.startsWith("ticket:editor:")) {
      await handleEditorButton(interaction);
      return true;
    }
    if (interaction.customId.startsWith("ticket:confirm:")) {
      const [, , action, requesterId] = interaction.customId.split(":");
      await handleConfirmation(interaction, action, requesterId);
      return true;
    }
    if (interaction.customId.startsWith("ticket:cancel:")) {
      const requesterId = interaction.customId.split(":")[2];
      if (interaction.user.id !== requesterId) {
        await interaction.reply({ content: "Only the person who started this reset can cancel it.", flags: MessageFlags.Ephemeral });
        return true;
      }
      await interaction.update({ content: "Reset cancelled.", components: [] });
      return true;
    }
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "ticket:editor:select") {
    const index = Number(interaction.values[0]);
    editorSelections.set(`${interaction.guildId}:${interaction.user.id}`, index);
    await interaction.update({
      content: `Selected embed slot ${index + 1}.`,
      components: editorComponents(index),
    });
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("ticket:editor:modal:")) {
    await savePanelEditorModal(interaction);
    return true;
  }

  return false;
}