import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { handleAddRoleButtonCommand } from "../src/role-menus.js";

export const data = new SlashCommandBuilder()
  .setName("addrolebutton")
  .setDescription("Add a self-assign role button to one of this bot's messages.")
  .addChannelOption((option) => option.setName("channel").setDescription("Message channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
  .addStringOption((option) => option.setName("message_id").setDescription("Bot-authored message ID").setRequired(true).setMinLength(17).setMaxLength(20))
  .addRoleOption((option) => option.setName("role").setDescription("Role granted by the button").setRequired(true))
  .addStringOption((option) => option.setName("button_label").setDescription("Button label; defaults to role name").setMaxLength(80))
  .addStringOption((option) => option.setName("color").setDescription("Hex color used to choose a Discord button style").setMaxLength(7));

export const execute = handleAddRoleButtonCommand;