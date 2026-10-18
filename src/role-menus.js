import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputStyle,
} from "discord.js";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const settingsPath = path.join(fileURLToPath(new URL("../data/", import.meta.url)), "role-menu-settings.json");
const defaults = {
  reaction: { channelId: null, messageId: null, options: [] },
  button: { channelId: null, messageId: null, options: [], embed: { title: "Choose Your Roles", description: "Click a button to toggle a role.", color: "#5865F2" } },
  standaloneMessages: {},
};
const editorSelections = new Map();
const roleButtonEditors = new Map();
const buttonStyles = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

async function readAll() {
  try {
    return JSON.parse(await readFile(settingsPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

export async function getRoleMenuSettings(guildId) {
  const all = await readAll();
  const saved = all[guildId] ?? {};
  return {
    ...defaults,
    ...saved,
    reaction: { ...defaults.reaction, ...(saved.reaction ?? {}) },
    button: { ...defaults.button, ...(saved.button ?? {}), embed: { ...defaults.button.embed, ...(saved.button?.embed ?? {}) } },
    standaloneMessages: { ...(saved.standaloneMessages ?? {}) },
  };
}

export async function updateRoleMenuSettings(guildId, updater) {
  const all = await readAll();
  const current = await getRoleMenuSettings(guildId);
  const next = await updater(current);
  all[guildId] = next;
  await mkdir(path.dirname(settingsPath), { recursive: true });
  const temporaryPath = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(all, null, 2)}\n`, "utf8");
  await rename(temporaryPath, settingsPath);
  return next;
}

async function ensureRolePermission(interaction, role) {
  const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) || !role.editable) {
    await interaction.editReply("I need Manage Roles, and my highest role must be above the role you selected.");
    return false;
  }
  return true;
}

function reactionKey(emoji) {
  const custom = /^<a?:[a-zA-Z0-9_]+:(\d+)>$/.exec(emoji);
  return custom?.[1] ?? emoji;
}

function reactionMenuEmbed(options) {
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("Choose Your Roles")
    .setDescription("React below to add or remove the corresponding role.");
  if (options.length) embed.addFields(options.slice(0, 25).map((option) => ({
    name: `${option.emoji} ${option.label || "Role"}`.slice(0, 256),
    value: `<@&${option.roleId}>${option.description ? `\n${option.description}` : ""}`.slice(0, 1024),
  })));
  else embed.setFooter({ text: "No roles have been added yet." });
  return embed;
}

async function publishReactionMenu(guild, settings) {
  if (!settings.reaction.channelId) return;
  const channel = await guild.channels.fetch(settings.reaction.channelId);
  if (!channel?.isTextBased()) throw new Error("Set a valid reaction-role text channel first.");
  const botMember = guild.members.me ?? await guild.members.fetchMe();
  if (!channel.permissionsFor(botMember)?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.ReadMessageHistory,
  ])) throw new Error("I need View Channel, Send Messages, Embed Links, Add Reactions, and Read Message History in that channel.");
  let message = null;
  if (settings.reaction.messageId) {
    message = await channel.messages.fetch(settings.reaction.messageId).catch(() => null);
    if (message?.author.id !== guild.client.user.id) message = null;
  }
  if (!message) {
    message = await channel.send({ embeds: [reactionMenuEmbed(settings.reaction.options)] });
    await updateRoleMenuSettings(guild.id, (current) => ({
      ...current,
      reaction: { ...current.reaction, messageId: message.id },
    }));
  } else {
    await message.edit({ embeds: [reactionMenuEmbed(settings.reaction.options)] });
  }
  await message.reactions.removeAll().catch(() => {});
  for (const option of settings.reaction.options) {
    await message.react(option.emoji);
  }
}

function buttonMenuEmbed(settings) {
  const embed = new EmbedBuilder()
    .setColor(Number.parseInt(settings.button.embed.color.replace(/^#/, ""), 16))
    .setTitle(settings.button.embed.title)
    .setDescription(settings.button.embed.description);
  if (settings.button.embed.imageUrl) embed.setImage(settings.button.embed.imageUrl);
  if (settings.button.embed.thumbnailUrl) embed.setThumbnail(settings.button.embed.thumbnailUrl);
  if (settings.button.embed.footer) embed.setFooter({ text: settings.button.embed.footer });
  return embed;
}

function buttonRows(options, customIdPrefix = "role-menu") {
  const buttons = options.slice(0, 25).map((option) => new ButtonBuilder()
    .setCustomId(`${customIdPrefix}:${option.roleId}`)
    .setLabel(option.label || "Toggle role")
    .setStyle(buttonStyles[option.style] ?? ButtonStyle.Primary));
  const rows = [];
  for (let index = 0; index < buttons.length; index += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(index, index + 5)));
  }
  return rows;
}

export async function publishButtonMenu(guild, settings) {
  if (!settings.button.channelId) throw new Error("Set a button-role channel first.");
  const channel = await guild.channels.fetch(settings.button.channelId);
  if (!channel?.isTextBased()) throw new Error("The configured button-role channel is unavailable.");
  let message = settings.button.messageId
    ? await channel.messages.fetch(settings.button.messageId).catch(() => null)
    : null;
  if (message?.author.id !== guild.client.user.id) message = null;
  const payload = {
    embeds: [buttonMenuEmbed(settings)],
    components: buttonRows(settings.button.options),
    allowedMentions: { parse: [] },
  };
  if (message) await message.edit(payload);
  else {
    message = await channel.send(payload);
    await updateRoleMenuSettings(guild.id, (current) => ({
      ...current,
      button: { ...current.button, messageId: message.id },
    }));
  }
  return message;
}

export async function handleReactionRolesCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply("You need Manage Server permission to configure reaction roles.");
    return;
  }
  const action = interaction.options.getSubcommand();
  const settings = await getRoleMenuSettings(interaction.guildId);
  if (action === "setchannel") {
    const channel = interaction.options.getChannel("channel", true);
    const updated = await updateRoleMenuSettings(interaction.guildId, (current) => ({
      ...current,
      reaction: { ...current.reaction, channelId: channel.id },
    }));
    try {
      await publishReactionMenu(interaction.guild, updated);
      await interaction.editReply(`Reaction-role menu set in <#${channel.id}>.`);
    } catch (error) {
      await interaction.editReply(`Channel saved, but I couldn't publish the menu: ${error.message}`);
    }
    return;
  }
  if (action === "add") {
    const role = interaction.options.getRole("role", true);
    if (!await ensureRolePermission(interaction, role)) return;
    const emoji = interaction.options.getString("emoji", true);
    const options = [...settings.reaction.options];
    if (options.length >= 20 || options.some((item) => item.roleId === role.id || item.emoji === emoji)) {
      await interaction.editReply("That role or emoji is already used, or the menu already has 20 options.");
      return;
    }
    options.push({
      roleId: role.id,
      emoji,
      label: interaction.options.getString("label") ?? role.name,
      description: interaction.options.getString("description") ?? "",
    });
    const updated = await updateRoleMenuSettings(interaction.guildId, (current) => ({
      ...current,
      reaction: { ...current.reaction, options },
    }));
    try {
      await publishReactionMenu(interaction.guild, updated);
      await interaction.editReply(`Added ${emoji} for <@&${role.id}> and refreshed the menu.`);
    } catch (error) {
      await interaction.editReply(`Role option saved, but the menu could not be refreshed: ${error.message}`);
    }
    return;
  }
  if (action === "remove") {
    const role = interaction.options.getRole("role", true);
    const options = settings.reaction.options.filter((item) => item.roleId !== role.id);
    const updated = await updateRoleMenuSettings(interaction.guildId, (current) => ({
      ...current,
      reaction: { ...current.reaction, options },
    }));
    if (updated.reaction.channelId) await publishReactionMenu(interaction.guild, updated).catch(() => {});
    await interaction.editReply(`Removed reaction-role option for <@&${role.id}>.`);
    return;
  }
  if (action === "list") {
    const list = settings.reaction.options.map((item) => `${item.emoji} <@&${item.roleId}>${item.description ? `: ${item.description}` : ""}`).join("\n") || "No reaction roles configured.";
    await interaction.editReply({ content: `Channel: ${settings.reaction.channelId ? `<#${settings.reaction.channelId}>` : "not set"}\n${list}` });
  }
}

export async function handleButtonRolesCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply("You need Manage Server permission to configure button roles.");
    return;
  }
  const action = interaction.options.getSubcommand();
  const settings = await getRoleMenuSettings(interaction.guildId);
  if (action === "setchannel") {
    const channel = interaction.options.getChannel("channel", true);
    const updated = await updateRoleMenuSettings(interaction.guildId, (current) => ({
      ...current,
      button: { ...current.button, channelId: channel.id },
    }));
    await interaction.editReply(`Button-role channel set to <#${channel.id}>. Run /buttonroles publish to post the menu.`);
    if (updated.button.options.length) await publishButtonMenu(interaction.guild, updated).catch(() => {});
    return;
  }
  if (action === "add") {
    const role = interaction.options.getRole("role", true);
    if (!await ensureRolePermission(interaction, role)) return;
    if (settings.button.options.some((item) => item.roleId === role.id) || settings.button.options.length >= 25) {
      await interaction.editReply("That role is already configured, or the menu already has 25 buttons.");
      return;
    }
    const options = [...settings.button.options, {
      roleId: role.id,
      label: interaction.options.getString("label") ?? role.name.slice(0, 80),
      description: interaction.options.getString("description") ?? "",
      style: "Primary",
    }];
    const updated = await updateRoleMenuSettings(interaction.guildId, (current) => ({ ...current, button: { ...current.button, options } }));
    await interaction.editReply(`Added a button for <@&${role.id}>.`);
    if (updated.button.channelId) await publishButtonMenu(interaction.guild, updated).catch(() => {});
    return;
  }
  if (action === "remove") {
    const role = interaction.options.getRole("role", true);
    const options = settings.button.options.filter((item) => item.roleId !== role.id);
    const updated = await updateRoleMenuSettings(interaction.guildId, (current) => ({ ...current, button: { ...current.button, options } }));
    if (updated.button.channelId) await publishButtonMenu(interaction.guild, updated).catch(() => {});
    await interaction.editReply(`Removed the button for <@&${role.id}>.`);
    return;
  }
  if (action === "setembed") {
    const color = interaction.options.getString("color") ?? settings.button.embed.color;
    if (!/^#?[0-9a-fA-F]{6}$/.test(color)) {
      await interaction.editReply("Color must be a six-digit hex value.");
      return;
    }
    const embed = {
      ...settings.button.embed,
      ...(interaction.options.getString("title") !== null ? { title: interaction.options.getString("title") } : {}),
      ...(interaction.options.getString("description") !== null ? { description: interaction.options.getString("description") } : {}),
      ...(interaction.options.getString("image_url") !== null ? { imageUrl: interaction.options.getString("image_url") } : {}),
      ...(interaction.options.getString("thumbnail_url") !== null ? { thumbnailUrl: interaction.options.getString("thumbnail_url") } : {}),
      ...(interaction.options.getString("footer") !== null ? { footer: interaction.options.getString("footer") } : {}),
      color,
    };
    for (const url of [embed.imageUrl, embed.thumbnailUrl]) {
      if (!url) continue;
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("Invalid URL protocol");
      } catch {
        await interaction.editReply("Image and thumbnail URLs must be valid HTTP or HTTPS URLs.");
        return;
      }
    }
    await updateRoleMenuSettings(interaction.guildId, (current) => ({ ...current, button: { ...current.button, embed } }));
    await interaction.editReply("Button-role embed saved.");
    return;
  }
  if (action === "publish") {
    try {
      const message = await publishButtonMenu(interaction.guild, settings);
      await interaction.editReply(`Button-role menu published: ${message.url}`);
    } catch (error) {
      await interaction.editReply(error.message);
    }
    return;
  }
  if (action === "setmessage") {
    const channel = interaction.options.getChannel("channel", true);
    const messageId = interaction.options.getString("message_id", true);
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message || message.author.id !== interaction.client.user.id) {
      await interaction.editReply("I can only attach buttons to a message authored by this bot.");
      return;
    }
    const updated = await updateRoleMenuSettings(interaction.guildId, (current) => ({
      ...current,
      button: { ...current.button, channelId: channel.id, messageId },
    }));
    try {
      await message.edit({ components: buttonRows(updated.button.options) });
      await interaction.editReply(`Button roles attached to message ${messageId}.`);
    } catch (error) {
      await interaction.editReply(`Could not edit that message: ${error.message}`);
    }
  }
  if (action === "list") {
    const list = settings.button.options.map((item) => `**${item.label}** <@&${item.roleId}>${item.description ? `: ${item.description}` : ""}`).join("\n") || "No button roles configured.";
    await interaction.editReply({ content: `Channel: ${settings.button.channelId ? `<#${settings.button.channelId}>` : "not set"}\n${list}` });
  }
}

function standaloneEditorRows(editor, selectedRoleId) {
  const selected = editor.options.find((option) => option.roleId === selectedRoleId) ?? editor.options[0];
  return [
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId("role-edit:select")
      .setPlaceholder("Choose a role button")
      .addOptions(editor.options.slice(0, 25).map((option) => ({
        label: option.label.slice(0, 100),
        value: option.roleId,
        default: option.roleId === selected?.roleId,
      })))),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId("role-edit:style")
      .setPlaceholder(`Button style: ${selected?.style ?? "Primary"}`)
      .addOptions(Object.keys(buttonStyles).map((style) => ({
        label: style,
        value: style,
        default: style === (selected?.style ?? "Primary"),
      })))),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("role-edit:label").setLabel("Edit label").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("role-edit:remove").setLabel("Remove button").setStyle(ButtonStyle.Danger),
    ),
  ];
}

async function editStandaloneMessage(guild, editor) {
  const channel = await guild.channels.fetch(editor.channelId);
  const message = await channel.messages.fetch(editor.messageId);
  if (message.author.id !== guild.client.user.id) throw new Error("The message is not authored by this bot.");
  await message.edit({ components: buttonRows(editor.options, "role-single") });
}

export async function handleAddRoleButtonCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.editReply("You need Manage Roles permission to add role buttons.");
    return;
  }
  const role = interaction.options.getRole("role", true);
  if (!await ensureRolePermission(interaction, role)) return;
  const channel = interaction.options.getChannel("channel", true);
  const messageId = interaction.options.getString("message_id", true);
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message || message.author.id !== interaction.client.user.id) {
    await interaction.editReply("I can only add role buttons to a message authored by this bot.");
    return;
  }
  if (message.components.some((row) => row.components.some((component) => !component.customId?.startsWith("role-single:")))) {
    await interaction.editReply("That message already has non-role buttons, so I won't replace its existing components.");
    return;
  }
  const color = interaction.options.getString("color") ?? "#5865F2";
  if (!/^#?[0-9a-fA-F]{6}$/.test(color)) {
    await interaction.editReply("Color must be a six-digit hex value.");
    return;
  }
  const rgb = Number.parseInt(color.replace(/^#/, ""), 16);
  const red = (rgb >> 16) & 255;
  const green = (rgb >> 8) & 255;
  const blue = rgb & 255;
  const style = red > green * 1.2 && red > blue * 1.2
    ? "Danger"
    : green > red * 1.2 && green > blue * 1.2
      ? "Success"
      : blue > red * 1.2 && blue > green * 1.2
        ? "Primary"
        : "Secondary";

  const settings = await getRoleMenuSettings(interaction.guildId);
  const current = settings.standaloneMessages[messageId] ?? { channelId: channel.id, messageId, options: [] };
  if (current.options.some((option) => option.roleId === role.id) || current.options.length >= 25) {
    await interaction.editReply("That role already has a button on this message, or the message already has 25 role buttons.");
    return;
  }
  const editor = {
    ...current,
    options: [...current.options, {
      roleId: role.id,
      label: interaction.options.getString("button_label") ?? role.name.slice(0, 80),
      style,
    }],
  };
  await updateRoleMenuSettings(interaction.guildId, (currentSettings) => ({
    ...currentSettings,
    standaloneMessages: { ...currentSettings.standaloneMessages, [messageId]: editor },
  }));
  await message.edit({ components: buttonRows(editor.options, "role-single") });
  await interaction.editReply(`Added a ${style.toLowerCase()} role button for <@&${role.id}>.`);
}

export async function handleEditRoleButtonCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.editReply("You need Manage Roles permission to edit role buttons.");
    return;
  }
  const channel = interaction.options.getChannel("channel", true);
  const messageId = interaction.options.getString("message_id", true);
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message || message.author.id !== interaction.client.user.id) {
    await interaction.editReply("I can only edit buttons on a message authored by this bot.");
    return;
  }
  const settings = await getRoleMenuSettings(interaction.guildId);
  const editor = settings.standaloneMessages[messageId];
  if (!editor?.options.length || editor.channelId !== channel.id) {
    await interaction.editReply("No role buttons managed by this command were found on that message.");
    return;
  }
  const key = `${interaction.guildId}:${interaction.user.id}`;
  roleButtonEditors.set(key, { ...editor, messageId, selectedRoleId: editor.options[0].roleId });
  await interaction.editReply({
    content: "Choose a role button to edit its style, change its label, or remove it.",
    components: standaloneEditorRows(editor, editor.options[0].roleId),
  });
}

async function saveStandaloneEditor(interaction, editor) {
  const next = await updateRoleMenuSettings(interaction.guildId, (current) => ({
    ...current,
    standaloneMessages: { ...current.standaloneMessages, [editor.messageId]: editor },
  }));
  const savedEditor = next.standaloneMessages[editor.messageId];
  await editStandaloneMessage(interaction.guild, savedEditor);
  return savedEditor;
}

async function handleRoleButtonEditor(interaction) {
  const key = `${interaction.guildId}:${interaction.user.id}`;
  const editor = roleButtonEditors.get(key);
  if (!editor) {
    await interaction.reply({ content: "This role-button editor has expired. Run /editrolebutton again.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "role-edit:select") {
    editor.selectedRoleId = interaction.values[0];
    roleButtonEditors.set(key, editor);
    await interaction.update({ content: "Role selected.", components: standaloneEditorRows(editor, editor.selectedRoleId) });
    return true;
  }
  if (interaction.isStringSelectMenu() && interaction.customId === "role-edit:style") {
    const option = editor.options.find((item) => item.roleId === editor.selectedRoleId);
    if (!option) return true;
    option.style = interaction.values[0];
    const saved = await saveStandaloneEditor(interaction, editor);
    roleButtonEditors.set(key, saved);
    await interaction.update({ content: `Style changed to ${option.style}.`, components: standaloneEditorRows(saved, saved.selectedRoleId) });
    return true;
  }
  if (interaction.isButton() && interaction.customId === "role-edit:label") {
    const modal = new ModalBuilder().setCustomId(`role-edit:modal:${interaction.guildId}:${interaction.user.id}:${editor.messageId}:${editor.selectedRoleId}`).setTitle("Edit role button label");
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId("label").setLabel("Button label").setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true)
      .setValue(editor.options.find((item) => item.roleId === editor.selectedRoleId)?.label ?? "Role")));
    await interaction.showModal(modal);
    return true;
  }
  if (interaction.isButton() && interaction.customId === "role-edit:remove") {
    editor.options = editor.options.filter((item) => item.roleId !== editor.selectedRoleId);
    await saveStandaloneEditor(interaction, editor);
    if (editor.options.length === 0) {
      roleButtonEditors.delete(key);
      await interaction.update({ content: "All role buttons were removed.", components: [] });
      return true;
    }
    editor.selectedRoleId = editor.options[0].roleId;
    roleButtonEditors.set(key, editor);
    await interaction.update({ content: "Role button removed.", components: standaloneEditorRows(editor, editor.selectedRoleId) });
    return true;
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith("role-edit:modal:")) {
    const [, , guildId, userId, messageId, roleId] = interaction.customId.split(":");
    if (guildId !== interaction.guildId || userId !== interaction.user.id || messageId !== editor.messageId) {
      await interaction.reply({ content: "This editor belongs to another user or message.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const option = editor.options.find((item) => item.roleId === roleId);
    if (!option) {
      await interaction.reply({ content: "That role button no longer exists.", flags: MessageFlags.Ephemeral });
      return true;
    }
    option.label = interaction.fields.getTextInputValue("label").trim();
    const saved = await saveStandaloneEditor(interaction, editor);
    roleButtonEditors.set(key, saved);
    await interaction.reply({ content: "Role button label updated.", flags: MessageFlags.Ephemeral });
    return true;
  }
  return false;
}

export async function handleRoleReaction(reaction, user, add) {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch();
  const message = reaction.message;
  if (!message.guild) return;
  const settings = await getRoleMenuSettings(message.guild.id);
  if (settings.reaction.messageId !== message.id) return;
  const key = reactionKey(reaction.emoji.id ?? reaction.emoji.name);
  const option = settings.reaction.options.find((item) => reactionKey(item.emoji) === key);
  if (!option) return;
  const member = await message.guild.members.fetch(user.id);
  const role = await message.guild.roles.fetch(option.roleId);
  if (!role?.editable) return;
  await (add ? member.roles.add(role) : member.roles.remove(role));
}

export async function handleRoleButton(interaction) {
  if (interaction.customId?.startsWith("role-edit:")) {
    return handleRoleButtonEditor(interaction);
  }
  if (!interaction.isButton()) return false;
  const config = await getRoleMenuSettings(interaction.guildId);
  let roleId;
  const managedMenu = interaction.customId.startsWith("role-menu:");
  if (managedMenu) roleId = interaction.customId.slice("role-menu:".length);
  else if (interaction.customId.startsWith("role-single:")) {
    roleId = interaction.customId.slice("role-single:".length);
    const messageSettings = config.standaloneMessages[interaction.message.id];
    if (!messageSettings?.options.some((option) => option.roleId === roleId)) return false;
  }
  else return false;

  if (managedMenu && !config.button.options.some((option) => option.roleId === roleId)) return false;

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const role = await interaction.guild.roles.fetch(roleId);
  const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
  if (!role || !botMember.permissions.has(PermissionFlagsBits.ManageRoles) || !role.editable) {
    await interaction.reply({ content: "I can't manage that role. Check my Manage Roles permission and role hierarchy.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (member.roles.cache.has(roleId)) {
    await member.roles.remove(role);
    await interaction.reply({ content: `Removed <@&${roleId}>.`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  } else {
    await member.roles.add(role);
    await interaction.reply({ content: `Added <@&${roleId}>.`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  }
  return true;
}