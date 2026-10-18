import { EmbedBuilder } from "discord.js";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dataDirectory = fileURLToPath(new URL("../data/", import.meta.url));
const settingsPath = path.join(dataDirectory, "moderation-log-channels.json");
const historyPath = path.join(dataDirectory, "moderation-history.json");

async function readSettings() {
  try {
    return JSON.parse(await readFile(settingsPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

export async function setModerationLogChannel(guildId, channelId) {
  await mkdir(dataDirectory, { recursive: true });
  const settings = await readSettings();
  settings[guildId] = channelId;

  const temporaryPath = `${settingsPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await rename(temporaryPath, settingsPath);
}

export async function clearModerationLogChannel(guildId) {
  await mkdir(dataDirectory, { recursive: true });
  const settings = await readSettings();
  delete settings[guildId];
  const temporaryPath = `${settingsPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await rename(temporaryPath, settingsPath);
}

async function recordHistory(interaction, { action, target, reason, extra }) {
  await mkdir(dataDirectory, { recursive: true });
  let history = {};
  try {
    history = JSON.parse(await readFile(historyPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const guildHistory = history[interaction.guildId] ?? {};
  const userHistory = guildHistory[target.id] ?? [];
  userHistory.push({
    action,
    targetTag: target.tag,
    moderatorId: interaction.user.id,
    moderatorTag: interaction.user.tag,
    reason,
    extra: extra ?? null,
    timestamp: new Date().toISOString(),
  });
  guildHistory[target.id] = userHistory.slice(-100);
  history[interaction.guildId] = guildHistory;
  const temporaryPath = `${historyPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
  await rename(temporaryPath, historyPath);
}

export async function getModerationHistory(guildId, userId, limit = 10) {
  try {
    const history = JSON.parse(await readFile(historyPath, "utf8"));
    return (history[guildId]?.[userId] ?? []).slice(-limit).reverse();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function logModerationAction(interaction, { action, target, reason, extra }) {
  try {
    await recordHistory(interaction, { action, target, reason, extra });
    const settings = await readSettings();
    const channelId = settings[interaction.guildId];
    if (!channelId) return;

    const channel = await interaction.client.channels.fetch(channelId);
    if (!channel?.isTextBased() || !channel.guildId || channel.guildId !== interaction.guildId) {
      console.error(`Configured moderation log channel is invalid for server ${interaction.guildId}.`);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xff3045)
      .setTitle("Moderation Action")
      .addFields(
        { name: "Action", value: action, inline: true },
        { name: "Target", value: `${target.tag} (<@${target.id}>)`, inline: true },
        { name: "Moderator", value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
        { name: "Reason", value: reason.slice(0, 1024) },
        ...(extra ? [{ name: "Extra", value: extra.slice(0, 1024) }] : []),
      )
      .setTimestamp();

    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    console.error("Could not send moderation log:", error);
  }
}