import { ChannelType, SlashCommandBuilder } from "discord.js";
import { executeEditEmbed } from "../src/embed-tools.js";

export const data = new SlashCommandBuilder()
  .setName("editembed")
  .setDescription("Edit or copy embeds from a bot-authored message.")
  .addChannelOption((option) => option.setName("channel").setDescription("Message channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
  .addStringOption((option) => option.setName("message_id").setDescription("Bot-authored message ID").setRequired(true).setMinLength(17).setMaxLength(20))
  .addChannelOption((option) => option.setName("resend_to").setDescription("Copy all embeds to another channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
  .addStringOption((option) => option.setName("title").setDescription("New title for the first embed").setMaxLength(256))
  .addStringOption((option) => option.setName("description").setDescription("New description for the first embed").setMaxLength(4000))
  .addStringOption((option) => option.setName("color").setDescription("Six-digit hex color").setMaxLength(7))
  .addStringOption((option) => option.setName("image_url").setDescription("Image URL").setMaxLength(2048))
  .addStringOption((option) => option.setName("thumbnail_url").setDescription("Thumbnail URL").setMaxLength(2048))
  .addStringOption((option) => option.setName("footer").setDescription("Footer text").setMaxLength(2048))
  .addStringOption((option) => option.setName("footer_icon_url").setDescription("Footer icon URL").setMaxLength(2048))
  .addStringOption((option) => option.setName("author_name").setDescription("Author name").setMaxLength(256))
  .addStringOption((option) => option.setName("author_icon_url").setDescription("Author icon URL").setMaxLength(2048));

export const execute = executeEditEmbed;