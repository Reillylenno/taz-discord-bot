import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { handleReactionRolesCommand } from "../src/role-menus.js";

export const data = new SlashCommandBuilder()
  .setName("reactionroles")
  .setDescription("Configure a reaction-based self-assign role menu.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) => subcommand.setName("setchannel").setDescription("Set the menu text channel.")
    .addChannelOption((option) => option.setName("channel").setDescription("Reaction role channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
  .addSubcommand((subcommand) => subcommand.setName("add").setDescription("Add a role and emoji option.")
    .addRoleOption((option) => option.setName("role").setDescription("Self-assignable role").setRequired(true))
    .addStringOption((option) => option.setName("emoji").setDescription("Unicode or custom emoji").setRequired(true).setMaxLength(100))
    .addStringOption((option) => option.setName("label").setDescription("Menu label").setMaxLength(80))
    .addStringOption((option) => option.setName("description").setDescription("Option description").setMaxLength(100)))
  .addSubcommand((subcommand) => subcommand.setName("remove").setDescription("Remove a role option.")
    .addRoleOption((option) => option.setName("role").setDescription("Role option to remove").setRequired(true)))
  .addSubcommand((subcommand) => subcommand.setName("list").setDescription("List configured reaction roles."));

export const execute = handleReactionRolesCommand;