import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { handleYouTubeCommand } from "../src/youtube.js";

export const data = new SlashCommandBuilder()
  .setName("disableyoutube")
  .setDescription("Disable YouTube live notifications for this server.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export const execute = handleYouTubeCommand;
