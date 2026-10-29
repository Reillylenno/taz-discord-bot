import { ChannelType, SlashCommandBuilder } from "discord.js";
import { executeSendEmbed } from "../src/embed-tools.js";

export const data = new SlashCommandBuilder()
  .setName("sendembed")
  .setDescription("Build, preview, and send up to ten embeds to a text channel.")
  .addChannelOption((option) => option.setName("channel").setDescription("Destination channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true));

export const execute = executeSendEmbed;