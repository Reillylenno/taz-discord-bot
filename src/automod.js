import { EmbedBuilder, MessageFlags, PermissionFlagsBits } from "discord.js";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasCommandAccess } from "./command-access.js";

const dataDirectory = fileURLToPath(new URL("../data/", import.meta.url));
const settingsPath = path.join(dataDirectory, "automod-settings.json");
const defaults = { enabled: false, blockedWords: [], blockedLinks: [], blockAllLinks: false, logChannelId: null };

export async function getAutomodSettings(guildId) {
  try {
    const all = JSON.parse(await readFile(settingsPath, "utf8"));
    return { ...defaults, ...(all[guildId] ?? {}) };
  } catch (error) {
    if (error.code === "ENOENT") return { ...defaults };
    throw error;
  }
}

export async function updateAutomodSettings(guildId, change) {
  await mkdir(dataDirectory, { recursive: true });
  let all = {};
  try {
    all = JSON.parse(await readFile(settingsPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  all[guildId] = { ...defaults, ...(all[guildId] ?? {}), ...change };
  const temporaryPath = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(all, null, 2)}\n`, "utf8");
  await rename(temporaryPath, settingsPath);
  return all[guildId];
}

export async function moderateMessage(message) {
  if (!message.guild || message.author.bot || !message.content) return;
  const settings = await getAutomodSettings(message.guild.id);
  if (!settings.enabled) return;
  if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const normalized = message.content.toLowerCase();
  const matchedWord = settings.blockedWords.find((word) => normalized.includes(word.toLowerCase()));
  const matchedLink = settings.blockAllLinks && /https?:\/\/\S+|discord\.gg\/\S+/i.test(message.content)
    ? "Links are disabled"
    : settings.blockedLinks.find((pattern) => normalized.includes(pattern.toLowerCase()));
  if (!matchedWord && !matchedLink) return;

  try {
    await message.delete();
  } catch (error) {
    console.error(`AutoMod could not delete message ${message.id}:`, error);
    return;
  }

  const reason = matchedWord ? `Blocked phrase: ${matchedWord}` : `Blocked link: ${matchedLink}`;
  await message.author.send(`Your message in **${message.guild.name}** was removed. ${reason}.`).catch(() => {});

  if (settings.logChannelId) {
    try {
      const channel = await message.guild.channels.fetch(settings.logChannelId);
      if (channel?.isTextBased()) {
        const log = new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle("AutoMod Action")
          .addFields(
            { name: "Member", value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
            { name: "Channel", value: `<#${message.channelId}>`, inline: true },
            { name: "Reason", value: reason.slice(0, 1024) },
            { name: "Message", value: (message.content || "[empty]").slice(0, 1024) },
          )
          .setTimestamp();
        await channel.send({ embeds: [log], allowedMentions: { parse: [] } });
      }
    } catch (error) {
      console.error("AutoMod log failed:", error);
    }
  }
}

export async function handleAutomodCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!await hasCommandAccess(interaction, "automod", PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply("You need the Manage Server permission to configure AutoMod.");
    return;
  }

  const action = interaction.options.getSubcommand();
  const settings = await getAutomodSettings(interaction.guildId);
  if (action === "enable" || action === "disable") {
    await updateAutomodSettings(interaction.guildId, { enabled: action === "enable" });
    await interaction.editReply(`AutoMod ${action === "enable" ? "enabled" : "disabled"}.`);
    return;
  }
  if (action === "togglelinks") {
    const enabled = interaction.options.getBoolean("enabled", true);
    await updateAutomodSettings(interaction.guildId, { blockAllLinks: enabled });
    await interaction.editReply(`Blocking all links ${enabled ? "enabled" : "disabled"}.`);
    return;
  }
  if (action === "addword" || action === "removeword") {
    const word = interaction.options.getString("word", true).trim();
    const words = new Set(settings.blockedWords);
    if (action === "addword") words.add(word);
    else words.delete(word);
    await updateAutomodSettings(interaction.guildId, { blockedWords: [...words] });
    await interaction.editReply(`${action === "addword" ? "Added" : "Removed"} blocked phrase **${word}**.`);
    return;
  }
  if (action === "addlink" || action === "removelink") {
    const link = interaction.options.getString("link", true).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!/^[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/.test(link)) {
      await interaction.editReply("Enter a domain or URL pattern, such as `example.com`.");
      return;
    }
    const links = new Set(settings.blockedLinks);
    if (action === "addlink") links.add(link);
    else links.delete(link);
    await updateAutomodSettings(interaction.guildId, { blockedLinks: [...links] });
    await interaction.editReply(`${action === "addlink" ? "Added" : "Removed"} blocked link pattern **${link}**.`);
    return;
  }
  if (action === "setlogchannel") {
    const channel = interaction.options.getChannel("channel", true);
    if (!channel.isTextBased() || channel.guildId !== interaction.guildId) {
      await interaction.editReply("Choose a text channel in this server.");
      return;
    }
    await updateAutomodSettings(interaction.guildId, { logChannelId: channel.id });
    await interaction.editReply(`AutoMod action logs will be sent to <#${channel.id}>.`);
    return;
  }
  if (action === "list") {
    const words = settings.blockedWords.length ? settings.blockedWords.join(", ").slice(0, 1024) : "None";
    const links = settings.blockedLinks.length ? settings.blockedLinks.join(", ").slice(0, 1024) : "None";
    await interaction.editReply({
      embeds: [new EmbedBuilder().setTitle("AutoMod Settings").setColor(0x5865f2).addFields(
        { name: "Enabled", value: settings.enabled ? "Yes" : "No", inline: true },
        { name: "Block all links", value: settings.blockAllLinks ? "Yes" : "No", inline: true },
        { name: "Log channel", value: settings.logChannelId ? `<#${settings.logChannelId}>` : "Not set", inline: true },
        { name: "Blocked words and phrases", value: words },
        { name: "Blocked link patterns", value: links },
      )],
    });
  }
}