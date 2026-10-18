import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import {
  defaultWelcomeSettings,
  getWelcomeSettings,
  saveWelcomeSettings,
} from "../src/welcome-settings.js";

export const data = new SlashCommandBuilder()
  .setName("setwelcomechannel")
  .setDescription("Set the channel used for future welcome messages.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription("Text channel where future welcome messages will be sent")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true),
  );

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply("You need the Manage Server permission to change the welcome channel.");
    return;
  }

  const channel = interaction.options.getChannel("channel", true);
  if (!channel.isTextBased() || channel.guildId !== interaction.guildId) {
    await interaction.editReply("Choose a text channel in this server.");
    return;
  }

  const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
  const requiredPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ];
  if (!channel.permissionsFor(botMember)?.has(requiredPermissions)) {
    await interaction.editReply(
      "I need View Channel, Send Messages, and Embed Links permissions in that channel.",
    );
    return;
  }

  try {
    const current = await getWelcomeSettings(interaction.guildId);
    const settings = {
      ...defaultWelcomeSettings,
      ...(current ?? {}),
      channelId: channel.id,
    };
    await saveWelcomeSettings(interaction.guildId, settings);
    await interaction.editReply(`Future welcome messages will be sent to <#${channel.id}>.`);
  } catch (error) {
    console.error("Could not save welcome channel:", error);
    await interaction.editReply("I couldn't save the welcome channel setting.");
  }
}