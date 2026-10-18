import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { buildWelcomeEmbeds, getWelcomeSettings, saveWelcomeSettings } from "./welcome-settings.js";

const selections = new Map();

export function welcomeEditorComponents(selectedIndex = 0) {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("welcome:editor:select")
        .setPlaceholder("Choose an embed slot")
        .addOptions(Array.from({ length: 10 }, (_, index) => ({
          label: `Welcome embed ${index + 1}`,
          value: String(index),
          default: index === selectedIndex,
        }))),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("welcome:editor:edit").setLabel("Edit selected slot").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("welcome:editor:preview").setLabel("Preview Embeds").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("welcome:editor:send").setLabel("Send All Embeds Now").setStyle(ButtonStyle.Success),
    ),
  ];
}

function createEditModal(guildId, userId, index, slot = {}) {
  const modal = new ModalBuilder()
    .setCustomId(`welcome:editor:modal:${guildId}:${userId}:${index}`)
    .setTitle(`Edit welcome embed ${index + 1}`);
  const fields = [
    ["title", "Title", TextInputStyle.Short, slot.title ?? "", 256],
    ["description", "Description", TextInputStyle.Paragraph, slot.description ?? "", 4000],
    ["color", "Six-digit hex color", TextInputStyle.Short, slot.color ?? "#00FF00", 7],
    ["image", "Image URL (optional)", TextInputStyle.Short, slot.imageUrl ?? "", 2048],
    ["footer", "Footer (optional)", TextInputStyle.Short, slot.footer ?? "", 2048],
  ];
  modal.addComponents(fields.map(([id, label, style, value, maxLength]) => {
    const input = new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(style)
      .setRequired(false)
      .setMaxLength(maxLength);
    if (value) input.setValue(value);
    return new ActionRowBuilder().addComponents(input);
  }));
  return modal;
}

async function handleModal(interaction) {
  const [, , , guildId, userId, indexText] = interaction.customId.split(":");
  if (interaction.guildId !== guildId || interaction.user.id !== userId) {
    await interaction.reply({ content: "This editor belongs to another user or server.", flags: MessageFlags.Ephemeral });
    return;
  }
  const title = interaction.fields.getTextInputValue("title").trim();
  const description = interaction.fields.getTextInputValue("description").trim();
  const color = interaction.fields.getTextInputValue("color").trim() || "#00FF00";
  const imageUrl = interaction.fields.getTextInputValue("image").trim();
  const footer = interaction.fields.getTextInputValue("footer").trim();
  if (!title && !description) {
    await interaction.reply({ content: "An embed needs a title or description.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!/^#?[0-9a-fA-F]{6}$/.test(color)) {
    await interaction.reply({ content: "Color must be a six-digit hex value, such as #00ff00.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (imageUrl) {
    try {
      const url = new URL(imageUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Invalid protocol");
    } catch {
      await interaction.reply({ content: "Image URL must be a valid HTTP or HTTPS URL.", flags: MessageFlags.Ephemeral });
      return;
    }
  }

  const index = Number(indexText);
  await saveWelcomeSettings(guildId, await getWelcomeSettings(guildId).then((current) => {
    const welcomeEmbeds = [...(current?.welcomeEmbeds ?? [])];
    welcomeEmbeds[index] = { title, description, color, imageUrl, footer };
    return { ...current, welcomeEmbeds, cleared: false };
  }));
  await interaction.reply({ content: `Saved welcome embed slot ${index + 1}.`, flags: MessageFlags.Ephemeral });
}

export async function handleWelcomeComponent(interaction) {
  if (!interaction.customId?.startsWith("welcome:")) return false;
  if (interaction.isModalSubmit() && interaction.customId.startsWith("welcome:editor:modal:")) {
    await handleModal(interaction);
    return true;
  }

  const key = `${interaction.guildId}:${interaction.user.id}`;
  const index = selections.get(key) ?? 0;
  if (interaction.isStringSelectMenu() && interaction.customId === "welcome:editor:select") {
    const selectedIndex = Number(interaction.values[0]);
    selections.set(key, selectedIndex);
    await interaction.update({ content: `Selected welcome embed ${selectedIndex + 1}.`, components: welcomeEditorComponents(selectedIndex) });
    return true;
  }

  if (!interaction.isButton()) return false;
  const settings = await getWelcomeSettings(interaction.guildId);
  if (interaction.customId === "welcome:editor:edit") {
    await interaction.showModal(createEditModal(interaction.guildId, interaction.user.id, index, settings?.welcomeEmbeds?.[index]));
    return true;
  }
  if (interaction.customId === "welcome:editor:preview") {
    const embeds = buildWelcomeEmbeds(settings, { id: interaction.user.id, user: interaction.user, guild: interaction.guild });
    await interaction.reply({ flags: MessageFlags.Ephemeral, content: "Welcome embed preview.", embeds });
    return true;
  }
  if (interaction.customId === "welcome:editor:send") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = await interaction.guild.channels.fetch(settings?.channelId).catch(() => null);
    if (!channel?.isTextBased()) {
      await interaction.editReply("The welcome channel is not configured or is unavailable.");
      return true;
    }
    const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
    if (!channel.permissionsFor(botMember)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
      await interaction.editReply("I can't post embeds in the configured welcome channel.");
      return true;
    }
    const embeds = buildWelcomeEmbeds(settings, { id: interaction.user.id, user: interaction.user, guild: interaction.guild });
    await channel.send({ embeds, allowedMentions: { parse: [] } });
    await interaction.editReply(`Sent ${embeds.length} welcome embed(s) to <#${channel.id}>.`);
    return true;
  }
  return false;
}