import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import {
  executeCommandAccess,
  handleCommandAccessAutocomplete,
} from "../src/command-access.js";

export const data = new SlashCommandBuilder()
  .setName("commandaccess")
  .setDescription("Delegate access to restricted commands.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) => subcommand.setName("list").setDescription("List commands currently delegated."))
  .addSubcommand((subcommand) => subcommand.setName("available").setDescription("List commands that can be delegated."))
  .addSubcommand((subcommand) => subcommand.setName("allow").setDescription("Delegate a command to members.")
    .addStringOption((option) => option.setName("command").setDescription("Delegatable command").setRequired(true).setAutocomplete(true)))
  .addSubcommand((subcommand) => subcommand.setName("revoke").setDescription("Revoke member delegation for a command.")
    .addStringOption((option) => option.setName("command").setDescription("Delegatable command").setRequired(true).setAutocomplete(true)))
  .addSubcommand((subcommand) => subcommand.setName("denyrole").setDescription("Deny a role from a delegated command.")
    .addStringOption((option) => option.setName("command").setDescription("Delegatable command").setRequired(true).setAutocomplete(true))
    .addRoleOption((option) => option.setName("role").setDescription("Role to deny").setRequired(true)))
  .addSubcommand((subcommand) => subcommand.setName("allowrole").setDescription("Remove a role-specific denial.")
    .addStringOption((option) => option.setName("command").setDescription("Delegatable command").setRequired(true).setAutocomplete(true))
    .addRoleOption((option) => option.setName("role").setDescription("Role to allow").setRequired(true)))
  .addSubcommand((subcommand) => subcommand.setName("rolelist").setDescription("Show role denials for a command.")
    .addStringOption((option) => option.setName("command").setDescription("Delegatable command").setRequired(true).setAutocomplete(true)));

export const execute = executeCommandAccess;
export const autocomplete = handleCommandAccessAutocomplete;