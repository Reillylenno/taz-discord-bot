import { SlashCommandBuilder } from "discord.js";
import { handleTwitchCommand } from "../src/twitch.js";

export const data = new SlashCommandBuilder()
  .setName("twitchlink")
  .setDescription("Link and verify a Twitch account.")
  .addSubcommand((subcommand) => subcommand.setName("link").setDescription("Start linking a Twitch account.")
    .addStringOption((option) => option.setName("username").setDescription("Twitch username").setRequired(true).setMinLength(3).setMaxLength(25)))
  .addSubcommand((subcommand) => subcommand.setName("verify").setDescription("Verify the code in your Twitch profile."))
  .addSubcommand((subcommand) => subcommand.setName("status").setDescription("Show your linked Twitch account."));

export const execute = handleTwitchCommand;