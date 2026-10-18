import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { getWelcomeSettings, saveWelcomeSettings } from "../src/welcome-settings.js";
import { welcomeEditorComponents } from "../src/welcome-editor.js";

export const data = new SlashCommandBuilder()
  .setName("editwelcome")
  .setDescription("Open an interactive editor for up to ten welcome embeds.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addChannelOption((option) => option.setName("channel").setDescription("Update the welcome channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
  .addBooleanOption((option) => option.setName("send_dm").setDescription("Also DM the welcome embeds to new members"));

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply("You need the Manage Server permission to edit welcome messages.");
    return;
  }

  const current = await getWelcomeSettings(interaction.guildId);
  const channel = interaction.options.getChannel("channel");
  const sendDm = interaction.options.getBoolean("send_dm");
  const channelId = channel?.id ?? current?.channelId;
  if (!channelId) {
    await interaction.editReply("Choose a channel or configure one first with /setwelcomechannel.");
    return;
  }
  if (channel && (!channel.isTextBased() || channel.guildId !== interaction.guildId)) {
    await interaction.editReply("Choose a text channel in this server.");
    return;
  }

  const welcomeChannel = channel ?? await interaction.guild.channels.fetch(channelId);
  const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
  if (!welcomeChannel?.permissionsFor(botMember)?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ])) {
    await interaction.editReply("I need View Channel, Send Messages, and Embed Links permissions in the welcome channel.");
    return;
  }

  await saveWelcomeSettings(interaction.guildId, {
    ...(current ?? {}),
    channelId,
    ...(sendDm !== null ? { sendDm } : {}),
    cleared: false,
  });
  await interaction.editReply({
    content: `Welcome embed editor for <#${channelId}>. Select a numbered slot to edit, preview the embeds, or send them all to the configured channel.`,
    components: welcomeEditorComponents(),
  });
}