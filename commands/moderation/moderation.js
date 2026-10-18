import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import * as banCommand from "./ban.js";
import * as kickCommand from "./kick.js";
import * as muteCommand from "./mute.js";
import * as unmuteCommand from "./unmute.js";
import * as warnCommand from "./warn.js";
import {
  clearModerationLogChannel,
  setModerationLogChannel,
} from "../../src/moderation-logs.js";
import { hasCommandAccess } from "../../src/command-access.js";

export const data = new SlashCommandBuilder()
  .setName("moderation")
  .setDescription("Moderate members or configure moderation logs.")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("log")
      .setDescription("Choose where moderation actions are logged.")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("The channel to receive moderation action embeds")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("setlog").setDescription("Choose the moderation log channel.")
      .addChannelOption((option) => option.setName("channel").setDescription("Log text channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)),
  )
  .addSubcommand((subcommand) => subcommand.setName("clearlog").setDescription("Stop sending moderation action logs to the configured channel."))
  .addSubcommand((subcommand) =>
    subcommand.setName("kick").setDescription("Kick a member.")
      .addUserOption((option) => option.setName("target").setDescription("Member to kick").setRequired(true))
      .addStringOption((option) => option.setName("reason").setDescription("Reason for the kick").setMaxLength(500)),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("ban").setDescription("Ban a member.")
      .addUserOption((option) => option.setName("target").setDescription("Member to ban").setRequired(true))
      .addStringOption((option) => option.setName("reason").setDescription("Reason for the ban").setMaxLength(500))
      .addIntegerOption((option) => option.setName("delete_days").setDescription("Days of recent messages to delete (0-7)").setMinValue(0).setMaxValue(7)),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("mute").setDescription("Timeout a member.")
      .addUserOption((option) => option.setName("target").setDescription("Member to timeout").setRequired(true))
      .addStringOption((option) => option.setName("duration").setDescription("Duration such as 30m, 2h, or 1d").setRequired(true).setMaxLength(32))
      .addStringOption((option) => option.setName("reason").setDescription("Reason for the timeout").setMaxLength(500)),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("unmute").setDescription("Remove a member's timeout.")
      .addUserOption((option) => option.setName("target").setDescription("Member to unmute").setRequired(true))
      .addStringOption((option) => option.setName("reason").setDescription("Reason for removing the timeout").setMaxLength(500)),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("warn").setDescription("Warn a member.")
      .addUserOption((option) => option.setName("target").setDescription("Member to warn").setRequired(true))
      .addStringOption((option) => option.setName("reason").setDescription("Reason for the warning").setMaxLength(500)),
  );

export async function execute(interaction) {
  const action = interaction.options.getSubcommand();
  const actionCommands = {
    kick: kickCommand,
    ban: banCommand,
    mute: muteCommand,
    unmute: unmuteCommand,
    warn: warnCommand,
  };
  if (actionCommands[action]) {
    await actionCommands[action].execute(interaction);
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!await hasCommandAccess(interaction, "moderation", PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply("You need the Manage Server permission to configure moderation logs.");
    return;
  }

  if (action === "clearlog") {
    try {
      await clearModerationLogChannel(interaction.guildId);
      await interaction.editReply("Moderation action logging has been disabled for this server.");
    } catch (error) {
      console.error("Could not clear moderation log channel:", error);
      await interaction.editReply("I couldn't clear the moderation log setting.");
    }
    return;
  }

  const channel = interaction.options.getChannel("channel", true);
  const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ])) {
    await interaction.editReply(
      "I need View Channel, Send Messages, and Embed Links permissions in that channel.",
    );
    return;
  }

  try {
    await setModerationLogChannel(interaction.guildId, channel.id);
    await interaction.editReply(`Moderation action embeds will be sent to <#${channel.id}>.`);
  } catch (error) {
    console.error("Could not save moderation log channel:", error);
    await interaction.editReply("I couldn't save the moderation log channel setting.");
  }
}