import { ChannelType, SlashCommandBuilder } from "discord.js";
import { executeSendEmbed } from "../src/embed-tools.js";

export const data = new SlashCommandBuilder()
  .setName("sendembed")
  .setDescription("Build, preview, and send up to ten embeds to a text channel.")
  .addChannelOption((option) => option.setName("channel").setDescription("Destination channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
  .addStringOption((option) => option.setName("message_id").setDescription("Optional bot-authored message to update").setMinLength(17).setMaxLength(20))
  .addBooleanOption((option) => option.setName("send_now").setDescription("Send saved embeds immediately"));

export const execute = executeSendEmbed;