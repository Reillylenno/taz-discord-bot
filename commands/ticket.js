import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { handleTicketCommand } from "../src/ticket-system.js";

const ticketCommand = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Configure and manage the server ticket system.")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("setpanel")
      .setDescription("Choose the public ticket panel channel.")
      .addChannelOption((option) => option.setName("channel").setDescription("Panel text channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("setcategory")
      .setDescription("Choose the category for new ticket channels.")
      .addChannelOption((option) => option.setName("category").setDescription("Ticket channel category").addChannelTypes(ChannelType.GuildCategory).setRequired(true)),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("setstaff")
      .setDescription("Choose the role that can see and manage tickets.")
      .addRoleOption((option) => option.setName("role").setDescription("Ticket staff role").setRequired(true)),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("settranscript")
      .setDescription("Choose where closed ticket transcripts are sent.")
      .addChannelOption((option) => option.setName("channel").setDescription("Transcript text channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("editembeds")
      .setDescription("Open the interactive editor for panel embed slots.")
      .addChannelOption((option) => option.setName("channel").setDescription("Panel text channel to edit").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("editpanel")
      .setDescription("Change the panel button label and style.")
      .addStringOption((option) => option.setName("button_label").setDescription("Label shown on the ticket button").setMinLength(1).setMaxLength(80))
      .addStringOption((option) => option.setName("button_style").setDescription("Button color style")
        .addChoices(
          { name: "Primary", value: "Primary" },
          { name: "Secondary", value: "Secondary" },
          { name: "Success", value: "Success" },
          { name: "Danger", value: "Danger" },
        )),
  )
  .addSubcommand((subcommand) => {
    subcommand
      .setName("editticket")
      .setDescription("Configure the embed shown in newly opened tickets.")
      .addStringOption((option) => option.setName("title").setDescription("Ticket embed title").setMaxLength(256))
      .addStringOption((option) => option.setName("description").setDescription("Ticket embed description").setMaxLength(4000))
      .addStringOption((option) => option.setName("footer").setDescription("Ticket embed footer").setMaxLength(2048))
      .addStringOption((option) => option.setName("color").setDescription("Six-digit hex color, e.g. #00ff00").setMaxLength(7))
      .addStringOption((option) => option.setName("image_url").setDescription("Ticket embed image URL").setMaxLength(2048));

    for (let fieldNumber = 1; fieldNumber <= 3; fieldNumber += 1) {
      subcommand
        .addStringOption((option) => option.setName(`ticket_field${fieldNumber}_name`).setDescription(`Name for ticket field ${fieldNumber}`).setMaxLength(256))
        .addStringOption((option) => option.setName(`ticket_field${fieldNumber}_value`).setDescription(`Value for ticket field ${fieldNumber}`).setMaxLength(1024))
        .addBooleanOption((option) => option.setName(`ticket_field${fieldNumber}_inline`).setDescription(`Display ticket field ${fieldNumber} inline`));
    }
    return subcommand;
  })
  .addSubcommand((subcommand) => subcommand.setName("publish").setDescription("Publish or update the ticket panel."))
  .addSubcommand((subcommand) => subcommand.setName("clearpanels").setDescription("Reset ticket state and remove bot-authored panel messages."))
  .addSubcommand((subcommand) => subcommand.setName("resetembed").setDescription("Reset panel and ticket embeds while preserving ticket configuration."))
  .addSubcommand((subcommand) => subcommand.setName("status").setDescription("Show the current ticket configuration."));

export const data = ticketCommand;
export const execute = handleTicketCommand;