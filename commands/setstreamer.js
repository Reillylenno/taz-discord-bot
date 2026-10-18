import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { handleTwitchCommand } from "../src/twitch.js";

export const data = new SlashCommandBuilder()
  .setName("setstreamer")
  .setDescription("Configure a Twitch streamer and live alert channel.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((option) => option.setName("streamer").setDescription("Twitch username").setRequired(true).setMinLength(3).setMaxLength(25))
  .addChannelOption((option) => option.setName("channel").setDescription("Live notification channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true));

export const execute = handleTwitchCommand;