import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { handleAutomodCommand } from "../src/automod.js";

export const data = new SlashCommandBuilder()
  .setName("automod")
  .setDescription("Configure automatic message filters.")
  .addSubcommand((subcommand) => subcommand.setName("enable").setDescription("Enable automatic filtering."))
  .addSubcommand((subcommand) => subcommand.setName("disable").setDescription("Disable automatic filtering."))
  .addSubcommand((subcommand) => subcommand.setName("addword").setDescription("Block a word or phrase.")
    .addStringOption((option) => option.setName("word").setDescription("Word or phrase to block").setMinLength(1).setMaxLength(200).setRequired(true)))
  .addSubcommand((subcommand) => subcommand.setName("removeword").setDescription("Unblock a word or phrase.")
    .addStringOption((option) => option.setName("word").setDescription("Word or phrase to remove").setMinLength(1).setMaxLength(200).setRequired(true)))
  .addSubcommand((subcommand) => subcommand.setName("addlink").setDescription("Block a domain or link pattern.")
    .addStringOption((option) => option.setName("link").setDescription("Domain or URL pattern").setMinLength(1).setMaxLength(200).setRequired(true)))
  .addSubcommand((subcommand) => subcommand.setName("removelink").setDescription("Unblock a domain or link pattern.")
    .addStringOption((option) => option.setName("link").setDescription("Domain or URL pattern").setMinLength(1).setMaxLength(200).setRequired(true)))
  .addSubcommand((subcommand) => subcommand.setName("togglelinks").setDescription("Enable or disable blocking all links.")
    .addBooleanOption((option) => option.setName("enabled").setDescription("Whether all links should be blocked").setRequired(true)))
  .addSubcommand((subcommand) => subcommand.setName("setlogchannel").setDescription("Set the AutoMod action log channel.")
    .addChannelOption((option) => option.setName("channel").setDescription("AutoMod log text channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
  .addSubcommand((subcommand) => subcommand.setName("list").setDescription("Show current filters and settings."));

export const execute = handleAutomodCommand;