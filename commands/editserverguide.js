import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { defaultServerGuide, getServerGuide, saveServerGuide } from "../src/server-guide.js";

const command = new SlashCommandBuilder()
  .setName("editserverguide")
  .setDescription("Update the server guide shown by ?serverguide.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((option) => option.setName("title").setDescription("Guide title").setMaxLength(256))
  .addStringOption((option) => option.setName("description").setDescription("Guide description").setMaxLength(4000))
  .addStringOption((option) => option.setName("color").setDescription("Six-digit hex color").setMaxLength(7))
  .addStringOption((option) => option.setName("footer").setDescription("Guide footer").setMaxLength(2048));

for (let index = 1; index <= 10; index += 1) {
  command
    .addStringOption((option) => option.setName(`field${index}_name`).setDescription(`Guide field ${index} name`).setMaxLength(256))
    .addStringOption((option) => option.setName(`field${index}_value`).setDescription(`Guide field ${index} value`).setMaxLength(1024));
}

export const data = command;

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const current = await getServerGuide(interaction.guildId);
  const guide = {
    ...defaultServerGuide,
    ...current,
    title: interaction.options.getString("title") ?? current.title,
    description: interaction.options.getString("description") ?? current.description,
    color: interaction.options.getString("color") ?? current.color,
    footer: interaction.options.getString("footer") ?? current.footer,
  };
  if (!/^#?[0-9a-fA-F]{6}$/.test(guide.color)) {
    await interaction.editReply("Color must be a six-digit hex value, such as #00ff00.");
    return;
  }

  const fields = [...current.fields];
  for (let index = 1; index <= 10; index += 1) {
    const name = interaction.options.getString(`field${index}_name`);
    const value = interaction.options.getString(`field${index}_value`);
    if (name === null && value === null) continue;
    if (!name || !value) {
      await interaction.editReply(`Provide both a name and value for field ${index}.`);
      return;
    }
    fields[index - 1] = { name, value };
  }
  guide.fields = fields.filter(Boolean).slice(0, 10);
  await saveServerGuide(interaction.guildId, guide);
  await interaction.editReply("Server guide saved. Members can use ?serverguide to view it.");
}