import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { buildWelcomeEmbeds, defaultWelcomeSettings, getWelcomeSettings } from "../src/welcome-settings.js";

export const data = new SlashCommandBuilder()
  .setName("testwelcome")
  .setDescription("Show an ephemeral preview of the configured welcome embed.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const settings = await getWelcomeSettings(interaction.guildId);
  if (!settings?.channelId) {
    await interaction.editReply("Set a welcome channel with /setwelcome or /setwelcomechannel first.");
    return;
  }
  if (settings.cleared) {
    await interaction.editReply("Welcome embeds are cleared. Configure them with /setwelcome first.");
    return;
  }

  await interaction.editReply({
    content: "Welcome preview. This does not change settings or send a message to the welcome channel.",
    embeds: buildWelcomeEmbeds({ ...defaultWelcomeSettings, ...settings }, {
      id: interaction.user.id,
      user: interaction.user,
      guild: interaction.guild,
    }),
  });
}