import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { handleTwitchCommand } from "../src/twitch.js";

export const data = new SlashCommandBuilder()
  .setName("disabletwitch")
  .setDescription("Disable Twitch live notifications for this server.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export const execute = handleTwitchCommand;