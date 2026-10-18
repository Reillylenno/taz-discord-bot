import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { handleEditRoleButtonCommand } from "../src/role-menus.js";

export const data = new SlashCommandBuilder()
  .setName("editrolebutton")
  .setDescription("Open a private editor for role buttons on one of this bot's messages.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addChannelOption((option) => option.setName("channel").setDescription("Message channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
  .addStringOption((option) => option.setName("message_id").setDescription("Bot-authored message ID").setRequired(true).setMinLength(17).setMaxLength(20));

export const execute = handleEditRoleButtonCommand;