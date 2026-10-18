import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getWelcomeSettings, saveWelcomeSettings } from "../src/welcome-settings.js";

export const data = new SlashCommandBuilder()
  .setName("clearwelcome")
  .setDescription("Clear saved welcome embed content without removing the welcome channel.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply("You need the Manage Server permission to clear welcome settings.");
    return;
  }

  const current = await getWelcomeSettings(interaction.guildId);
  if (!current) {
    await interaction.editReply("No welcome configuration has been saved yet.");
    return;
  }

  await saveWelcomeSettings(interaction.guildId, {
    channelId: current.channelId,
    cleared: true,
    welcomeEmbeds: [],
  });
  await interaction.editReply("Welcome embed content cleared. The channel and messages already sent were left unchanged.");
}