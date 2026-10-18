import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { logModerationAction } from "../../src/moderation-logs.js";
import { hasCommandAccess } from "../../src/command-access.js";

export const data = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Kick a member and send them the reason by direct message.")
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addUserOption((option) =>
    option
      .setName("member")
      .setDescription("The member to kick")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("The reason to include in the direct message")
      .setMaxLength(500)
      .setRequired(true),
  );

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const target = interaction.options.getMember("member") ?? interaction.options.getMember("target");
  const reason = interaction.options.getString("reason") ?? "No reason provided.";

  if (!target) {
    await interaction.editReply("I couldn't find that member in this server.");
    return;
  }

  if (target.id === interaction.user.id || target.id === interaction.client.user.id) {
    await interaction.editReply("You can't kick yourself or the bot.");
    return;
  }

  const delegated = interaction.commandName === "moderation" && await hasCommandAccess(interaction, "moderation");
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.KickMembers) && !delegated) {
    await interaction.editReply("You need the Kick Members permission to use this command.");
    return;
  }

  const botMember = interaction.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.KickMembers)) {
    await interaction.editReply("I need the Kick Members permission to do that.");
    return;
  }

  if (!target.kickable) {
    await interaction.editReply(
      "I can't kick that member. Check that my role is above theirs and I have the Kick Members permission.",
    );
    return;
  }

  let directMessage;
  try {
    directMessage = await target.send({
      content: `A moderator is kicking you from **${interaction.guild.name}**.\n\n**Reason:** ${reason}`,
      allowedMentions: { parse: [] },
    });
  } catch {
    await interaction.editReply(
      "I couldn't send that member a direct message, so I did not kick them.",
    );
    return;
  }

  try {
    await target.kick(`Kicked by ${interaction.user.tag}: ${reason}`);
  } catch {
    await interaction.editReply(
      "The DM was sent, but I couldn't kick that member. Check my role and server permissions.",
    );
    return;
  }

  await logModerationAction(interaction, {
    action: "Kick",
    target: target.user,
    reason,
  });

  try {
    await directMessage.edit({
      content: `You have been kicked from **${interaction.guild.name}**.\n\n**Reason:** ${reason}`,
      allowedMentions: { parse: [] },
    });
    await interaction.editReply(`Kicked **${target.user.tag}**. The reason was sent by DM.`);
  } catch {
    await interaction.editReply(
      `Kicked **${target.user.tag}**. The DM with the reason was sent, but I couldn't update it with the final status.`,
    );
  }
}