import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { handleTwitchCommand } from "../src/twitch.js";

export const data = new SlashCommandBuilder()
  .setName("twitchsubrole")
  .setDescription("Choose the role assigned to verified Twitch subscribers.")
  .addRoleOption((option) => option.setName("role").setDescription("Subscriber role").setRequired(true));

export const execute = handleTwitchCommand;