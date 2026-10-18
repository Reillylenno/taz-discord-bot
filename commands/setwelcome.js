import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import {
  buildWelcomeEmbeds,
  defaultWelcomeSettings,
  getWelcomeSettings,
  saveWelcomeSettings,
} from "../src/welcome-settings.js";

export const data = new SlashCommandBuilder()
  .setName("setwelcome")
  .setDescription("Configure welcome messages for new members.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription("Text channel where welcome messages are posted")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
  )
  .addStringOption((option) =>
    option.setName("title").setDescription("Welcome embed title").setMaxLength(256),
  )
  .addStringOption((option) =>
    option.setName("description").setDescription("Welcome embed description").setMaxLength(4000),
  )
  .addStringOption((option) =>
    option.setName("color").setDescription("Six-digit hex color, e.g. #00ff00").setMaxLength(7),
  )
  .addStringOption((option) =>
    option.setName("image_url").setDescription("Large embed image URL").setMaxLength(2048),
  )
  .addStringOption((option) =>
    option.setName("thumbnail_url").setDescription("Embed thumbnail URL").setMaxLength(2048),
  )
  .addStringOption((option) =>
    option.setName("footer").setDescription("Embed footer text").setMaxLength(2048),
  )
  .addStringOption((option) =>
    option.setName("footer_icon_url").setDescription("Footer icon URL").setMaxLength(2048),
  )
  .addStringOption((option) =>
    option.setName("author_name").setDescription("Embed author name").setMaxLength(256),
  )
  .addStringOption((option) =>
    option.setName("author_icon_url").setDescription("Author icon URL").setMaxLength(2048),
  )
  .addBooleanOption((option) =>
    option.setName("send_dm").setDescription("Also DM the welcome embed to each new member"),
  )
  .addBooleanOption((option) =>
    option.setName("preview").setDescription("Post a preview in the channel where this command is run"),
  );

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply("You need the Manage Server permission to configure welcome messages.");
    return;
  }

  const channel = interaction.options.getChannel("channel");
  if (channel && (!channel.isTextBased() || channel.guildId !== interaction.guildId)) {
    await interaction.editReply("Choose a text channel in this server.");
    return;
  }

  const current = await getWelcomeSettings(interaction.guildId);
  const settings = {
    ...defaultWelcomeSettings,
    ...(current ?? {}),
    channelId: channel?.id ?? current?.channelId ?? null,
  };

  const stringOptions = [
    ["title", "title"],
    ["description", "description"],
    ["color", "color"],
    ["image_url", "imageUrl"],
    ["thumbnail_url", "thumbnailUrl"],
    ["footer", "footer"],
    ["footer_icon_url", "footerIconUrl"],
    ["author_name", "authorName"],
    ["author_icon_url", "authorIconUrl"],
  ];

  for (const [optionName, settingName] of stringOptions) {
    const value = interaction.options.getString(optionName);
    if (value !== null) settings[settingName] = value;
  }

  const sendDm = interaction.options.getBoolean("send_dm");
  if (sendDm !== null) settings.sendDm = sendDm;

  const preview = interaction.options.getBoolean("preview") ?? false;
  const hasConfigChanges = Boolean(channel)
    || stringOptions.some(([optionName]) => interaction.options.getString(optionName) !== null)
    || sendDm !== null;

  if (!/^#?[0-9a-fA-F]{6}$/.test(settings.color)) {
    await interaction.editReply("Color must be a six-digit hex value, such as #00ff00.");
    return;
  }

  for (const [label, value] of [
    ["Image URL", settings.imageUrl],
    ["Thumbnail URL", settings.thumbnailUrl],
    ["Footer icon URL", settings.footerIconUrl],
    ["Author icon URL", settings.authorIconUrl],
  ]) {
    if (value && !isHttpUrl(value)) {
      await interaction.editReply(`${label} must be a valid HTTP or HTTPS URL.`);
      return;
    }
  }

  if (settings.footerIconUrl && !settings.footer) {
    await interaction.editReply("Set footer text when using a footer icon URL.");
    return;
  }
  if (settings.authorIconUrl && !settings.authorName) {
    await interaction.editReply("Set an author name when using an author icon URL.");
    return;
  }

  if (!hasConfigChanges && !preview) {
    await interaction.editReply("Set at least one welcome option or set preview to true.");
    return;
  }

  if (hasConfigChanges && !settings.channelId) {
    await interaction.editReply("Choose a welcome channel with this command or use /setwelcomechannel first.");
    return;
  }

  const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
  const requiredPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ];
  const configuredChannel = settings.channelId ? await interaction.guild.channels.fetch(settings.channelId) : null;
  if (hasConfigChanges && !configuredChannel?.permissionsFor(botMember)?.has(requiredPermissions)) {
    await interaction.editReply(
      "I need View Channel, Send Messages, and Embed Links permissions in the welcome channel.",
    );
    return;
  }

  if (preview && (!interaction.channel?.isTextBased()
    || !interaction.channel.permissionsFor(botMember)?.has(requiredPermissions))) {
    await interaction.editReply(
      "I need View Channel, Send Messages, and Embed Links permissions in the command channel to post a preview.",
    );
    return;
  }

  if (hasConfigChanges) {
    try {
      settings.cleared = false;
      settings.welcomeEmbeds = [];
      await saveWelcomeSettings(interaction.guildId, settings);
    } catch (error) {
      console.error("Could not save welcome settings:", error);
      await interaction.editReply("I couldn't save the welcome settings.");
      return;
    }
  }

  if (preview) {
    try {
      const previewMember = {
        id: interaction.user.id,
        user: interaction.user,
        guild: interaction.guild,
      };
      await interaction.channel.send({
        embeds: buildWelcomeEmbeds(settings, previewMember),
        allowedMentions: { parse: [] },
      });
      await interaction.editReply(`${hasConfigChanges ? "Welcome settings saved. " : ""}Preview posted in <#${interaction.channelId}>.`);
      return;
    } catch (error) {
      console.error("Could not send welcome preview:", error);
      await interaction.editReply(`${hasConfigChanges ? "Welcome settings were saved, but " : ""}I couldn't post the preview.`);
      return;
    }
  }

  await interaction.editReply(`Welcome settings saved for <#${settings.channelId}>.`);
}