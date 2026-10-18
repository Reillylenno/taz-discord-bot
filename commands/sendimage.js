import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("sendimage")
  .setDescription("Send an uploaded image to a text channel.")
  .addChannelOption((option) => option.setName("channel").setDescription("Destination channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
  .addAttachmentOption((option) => option.setName("image").setDescription("Image attachment").setRequired(true))
  .addStringOption((option) => option.setName("caption").setDescription("Optional image caption").setMaxLength(2000));

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const channel = interaction.options.getChannel("channel", true);
  const image = interaction.options.getAttachment("image", true);
  if (!channel.isTextBased() || channel.guildId !== interaction.guildId) {
    await interaction.editReply("Choose a text channel in this server.");
    return;
  }
  if (!image.contentType?.startsWith("image/")) {
    await interaction.editReply("The attachment must be an image file.");
    return;
  }
  const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
  if (!channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles])) {
    await interaction.editReply("I need View Channel, Send Messages, and Attach Files permissions in that channel.");
    return;
  }
  await channel.send({
    content: interaction.options.getString("caption") ?? undefined,
    files: [image.url],
    allowedMentions: { parse: [] },
  });
  await interaction.editReply(`Image sent to <#${channel.id}>.`);
}