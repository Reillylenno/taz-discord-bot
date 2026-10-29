import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { handleYouTubeCommand } from "../src/youtube.js";

export const data = new SlashCommandBuilder()
  .setName("setyoutube")
  .setDescription("Configure YouTube live alerts for this server.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((option) => option
    .setName("channel_id")
    .setDescription("Your YouTube channel ID (starts with UC)")
    .setRequired(true)
    .setMinLength(24)
    .setMaxLength(24))
  .addChannelOption((option) => option
    .setName("channel")
    .setDescription("Discord channel for live notifications")
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setRequired(true));

export const execute = handleYouTubeCommand;
