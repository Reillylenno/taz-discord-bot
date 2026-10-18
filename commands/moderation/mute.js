import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { logModerationAction } from "../../src/moderation-logs.js";
import { hasCommandAccess } from "../../src/command-access.js";

const muteDurations = new Map([
  ["5m", { label: "5 minutes", milliseconds: 5 * 60 * 1000 }],
  ["10m", { label: "10 minutes", milliseconds: 10 * 60 * 1000 }],
  ["30m", { label: "30 minutes", milliseconds: 30 * 60 * 1000 }],
  ["1h", { label: "1 hour", milliseconds: 60 * 60 * 1000 }],
  ["2h", { label: "2 hours", milliseconds: 2 * 60 * 60 * 1000 }],
  ["3h", { label: "3 hours", milliseconds: 3 * 60 * 60 * 1000 }],
  ["5h", { label: "5 hours", milliseconds: 5 * 60 * 60 * 1000 }],
  ["1d", { label: "1 day", milliseconds: 24 * 60 * 60 * 1000 }],
  ["5d", { label: "5 days", milliseconds: 5 * 24 * 60 * 60 * 1000 }],
  ["1w", { label: "1 week", milliseconds: 7 * 24 * 60 * 60 * 1000 }],
]);

export const data = new SlashCommandBuilder()
  .setName("mute")
  .setDescription("Timeout a member and send them the reason by direct message.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((option) =>
    option
      .setName("member")
      .setDescription("The member to mute")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("duration")
      .setDescription("How long the member should be muted")
      .setRequired(true)
      .addChoices(
        ...[...muteDurations].map(([value, { label }]) => ({ name: label, value })),
      ),
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
  const durationChoice = interaction.options.getString("duration", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided.";
  let duration = muteDurations.get(durationChoice);
  if (!duration) {
    const match = /^(\d+)(s|m|h|d|w)$/i.exec(durationChoice);
    if (match) {
      const units = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
      const milliseconds = Number(match[1]) * units[match[2].toLowerCase()];
      if (milliseconds > 0 && milliseconds <= 28 * 24 * 60 * 60 * 1000) {
        duration = { label: `${match[1]}${match[2].toLowerCase()}`, milliseconds };
      }
    }
  }

  if (!target) {
    await interaction.editReply("I couldn't find that member in this server.");
    return;
  }

  if (!duration) {
    await interaction.editReply("Choose one of the listed mute durations.");
    return;
  }

  if (target.id === interaction.user.id || target.id === interaction.client.user.id) {
    await interaction.editReply("You can't mute yourself or the bot.");
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

  if (!target.moderatable) {
    await interaction.editReply(
      "I can't mute that member. Check my role and server permissions.",
    );
    return;
  }

  const expiresAt = Math.floor((Date.now() + duration.milliseconds) / 1000);
  let directMessage;
  try {
    directMessage = await target.send({
      content: `A moderator is muting you in **${interaction.guild.name}** for **${duration.label}**.\n\n**Reason:** ${reason}`,
      allowedMentions: { parse: [] },
    });
  } catch {
    await interaction.editReply(
      "I couldn't send that member a direct message, so I did not mute them.",
    );
    return;
  }

  try {
    await target.timeout(
      duration.milliseconds,
      `Muted by ${interaction.user.tag} for ${duration.label}: ${reason}`,
    );
  } catch {
    await interaction.editReply(
      "The DM was sent, but I couldn't mute that member. Check my role and server permissions.",
    );
    return;
  }

  await logModerationAction(interaction, {
    action: "Mute",
    target: target.user,
    reason,
    extra: `Duration: ${duration.label}; ends <t:${expiresAt}:F>`,
  });

  try {
    await directMessage.edit({
      content: `You have been muted in **${interaction.guild.name}** for **${duration.label}**. This mute ends <t:${expiresAt}:F>.\n\n**Reason:** ${reason}`,
      allowedMentions: { parse: [] },
    });
    await interaction.editReply(
      `Muted **${target.user.tag}** for ${duration.label}. The reason was sent by DM.`,
    );
  } catch {
    await interaction.editReply(
      `Muted **${target.user.tag}** for ${duration.label}. The DM with the reason was sent, but I couldn't update it with the final status.`,
    );
  }
}