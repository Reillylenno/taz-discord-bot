import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { handleButtonRolesCommand } from "../src/role-menus.js";

export const data = new SlashCommandBuilder()
  .setName("buttonroles")
  .setDescription("Configure a button-based self-assign role menu.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) => subcommand.setName("setchannel").setDescription("Choose the menu channel.")
    .addChannelOption((option) => option.setName("channel").setDescription("Button role channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
  .addSubcommand((subcommand) => subcommand.setName("add").setDescription("Add a button role option.")
    .addRoleOption((option) => option.setName("role").setDescription("Self-assignable role").setRequired(true))
    .addStringOption((option) => option.setName("label").setDescription("Button label; defaults to role name").setMaxLength(80))
    .addStringOption((option) => option.setName("description").setDescription("Option description").setMaxLength(100)))
  .addSubcommand((subcommand) => subcommand.setName("remove").setDescription("Remove a button role option.")
    .addRoleOption((option) => option.setName("role").setDescription("Role option to remove").setRequired(true)))
  .addSubcommand((subcommand) => subcommand.setName("list").setDescription("List configured button roles."))
  .addSubcommand((subcommand) => subcommand.setName("setembed").setDescription("Customize the menu embed.")
    .addStringOption((option) => option.setName("title").setDescription("Embed title").setMaxLength(256))
    .addStringOption((option) => option.setName("description").setDescription("Embed description").setMaxLength(4000))
    .addStringOption((option) => option.setName("color").setDescription("Six-digit hex color").setMaxLength(7))
    .addStringOption((option) => option.setName("image_url").setDescription("Image URL").setMaxLength(2048))
    .addStringOption((option) => option.setName("thumbnail_url").setDescription("Thumbnail URL").setMaxLength(2048))
    .addStringOption((option) => option.setName("footer").setDescription("Footer text").setMaxLength(2048)))
  .addSubcommand((subcommand) => subcommand.setName("publish").setDescription("Publish or refresh the menu."))
  .addSubcommand((subcommand) => subcommand.setName("setmessage").setDescription("Attach role buttons to a bot-authored message.")
    .addChannelOption((option) => option.setName("channel").setDescription("Channel with the message").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
    .addStringOption((option) => option.setName("message_id").setDescription("Message ID to edit").setRequired(true).setMinLength(17).setMaxLength(20)));

export const execute = handleButtonRolesCommand;