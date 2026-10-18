import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { logModerationAction } from "../../src/moderation-logs.js";
import { hasCommandAccess } from "../../src/command-access.js";

export const data = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("Send a member a warning by direct message.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((option) =>
    option
      .setName("member")
      .setDescription("The member to warn")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("The reason for the warning")
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
    await interaction.editReply("You can't warn yourself or the bot.");
    return;
  }

  const delegated = interaction.commandName === "moderation" && await hasCommandAccess(interaction, "moderation");
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) && !delegated) {
    await interaction.editReply("You need the Moderate Members permission to use this command.");
    return;
  }

  try {
    await target.send({
      content: `You have received a warning in **${interaction.guild.name}** from a moderator.\n\n**Reason:** ${reason}`,
      allowedMentions: { parse: [] },
    });
  } catch {
    await interaction.editReply(
      "I couldn't send that member a direct message, so the warning was not delivered.",
    );
    return;
  }

  await logModerationAction(interaction, {
    action: "Warn",
    target: target.user,
    reason,
  });

  await interaction.editReply(
    `Warning sent to **${target.user.tag}** by DM with the reason: ${reason}`,
  );
}