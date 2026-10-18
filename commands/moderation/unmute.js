import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { logModerationAction } from "../../src/moderation-logs.js";
import { hasCommandAccess } from "../../src/command-access.js";

export const data = new SlashCommandBuilder()
  .setName("unmute")
  .setDescription("Remove a member's timeout and notify them by direct message.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((option) =>
    option
      .setName("member")
      .setDescription("The member to unmute")
      .setRequired(true),
  );

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const target = interaction.options.getMember("member") ?? interaction.options.getMember("target");
  const reason = interaction.options.getString("reason") ?? "Timeout removed by moderator.";

  if (!target) {
    await interaction.editReply("I couldn't find that member in this server.");
    return;
  }

  if (target.id === interaction.user.id || target.id === interaction.client.user.id) {
    await interaction.editReply("You can't unmute yourself or the bot.");
    return;
  }

  const delegated = interaction.commandName === "moderation" && await hasCommandAccess(interaction, "moderation");
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) && !delegated) {
    await interaction.editReply("You need the Moderate Members permission to use this command.");
    return;
  }

  const botMember = interaction.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    await interaction.editReply("I need the Moderate Members permission to do that.");
    return;
  }

  if (!target.communicationDisabledUntilTimestamp) {
    await interaction.editReply("That member does not currently have an active timeout.");
    return;
  }

  if (!target.moderatable) {
    await interaction.editReply(
      "I can't unmute that member. Check my role and server permissions.",
    );
    return;
  }

  try {
    await target.timeout(null, `Unmuted by ${interaction.user.tag}: ${reason}`);
  } catch {
    await interaction.editReply(
      "I couldn't remove that member's timeout. Check my role and server permissions.",
    );
    return;
  }

  await logModerationAction(interaction, {
    action: "Unmute",
    target: target.user,
    reason,
  });

  let dmSent = true;
  try {
    await target.send({
      content: `You have been unmuted in **${interaction.guild.name}**. You can speak in the server again.`,
      allowedMentions: { parse: [] },
    });
  } catch {
    dmSent = false;
  }

  await interaction.editReply(
    dmSent
      ? `Unmuted **${target.user.tag}**. They were notified by DM.`
      : `Unmuted **${target.user.tag}**, but I couldn't DM them because their direct messages may be closed.`,
  );
}