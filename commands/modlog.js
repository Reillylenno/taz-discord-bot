import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { getModerationHistory } from "../src/moderation-logs.js";
import { hasCommandAccess } from "../src/command-access.js";

export const data = new SlashCommandBuilder()
  .setName("modlog")
  .setDescription("Look up a member's recent moderation history.")
  .addStringOption((option) =>
    option.setName("user_id").setDescription("Discord user ID").setRequired(true).setMinLength(17).setMaxLength(20),
  )
  .addIntegerOption((option) =>
    option.setName("limit").setDescription("Number of recent entries (1-10)").setMinValue(1).setMaxValue(10),
  );

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!await hasCommandAccess(interaction, "modlog", PermissionFlagsBits.ManageMessages)) {
    await interaction.editReply("You need Manage Messages permission or delegated /modlog access.");
    return;
  }
  const userId = interaction.options.getString("user_id", true);
  if (!/^\d{17,20}$/.test(userId)) {
    await interaction.editReply("Enter a valid Discord user ID.");
    return;
  }

  const limit = interaction.options.getInteger("limit") ?? 10;
  const history = await getModerationHistory(interaction.guildId, userId, limit);
  if (history.length === 0) {
    await interaction.editReply("No moderation history was found for that user.");
    return;
  }

  const embeds = history.map((entry) => new EmbedBuilder()
    .setColor(0xff3045)
    .setTitle(`${entry.action}: ${entry.targetTag}`)
    .addFields(
      { name: "Moderator", value: `${entry.moderatorTag} (<@${entry.moderatorId}>)`, inline: true },
      { name: "Date", value: `<t:${Math.floor(new Date(entry.timestamp).getTime() / 1000)}:F>`, inline: true },
      { name: "Reason", value: (entry.reason || "No reason provided.").slice(0, 1024) },
      ...(entry.extra ? [{ name: "Extra", value: entry.extra.slice(0, 1024) }] : []),
    ));

  await interaction.editReply({ embeds, allowedMentions: { parse: [] } });
}