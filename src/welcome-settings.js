import { EmbedBuilder } from "discord.js";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dataDirectory = fileURLToPath(new URL("../data/", import.meta.url));
const settingsPath = path.join(dataDirectory, "welcome-settings.json");

export const defaultWelcomeSettings = {
  title: "Welcome!",
  description: "Welcome to {server}, {user}!",
  color: "#00FF00",
  sendDm: false,
};

export async function getWelcomeSettings(guildId) {
  try {
    const settings = JSON.parse(await readFile(settingsPath, "utf8"));
    return settings[guildId] ?? null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function saveWelcomeSettings(guildId, nextSettings) {
  await mkdir(dataDirectory, { recursive: true });
  let settings = {};

  try {
    settings = JSON.parse(await readFile(settingsPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  settings[guildId] = nextSettings;
  const temporaryPath = `${settingsPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await rename(temporaryPath, settingsPath);
}

function applyMemberPlaceholders(value, member) {
  return value
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{username}", member.user.username)
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{memberCount}", String(member.guild.memberCount));
}

export function buildWelcomeEmbed(settings, member) {
  const embed = new EmbedBuilder()
    .setColor(Number.parseInt(settings.color.replace(/^#/, ""), 16))
    .setTitle(applyMemberPlaceholders(settings.title, member))
    .setDescription(applyMemberPlaceholders(settings.description, member));

  if (settings.imageUrl) embed.setImage(settings.imageUrl);
  if (settings.thumbnailUrl) embed.setThumbnail(settings.thumbnailUrl);
  if (settings.footer) {
    embed.setFooter({
      text: applyMemberPlaceholders(settings.footer, member),
      ...(settings.footerIconUrl ? { iconURL: settings.footerIconUrl } : {}),
    });
  }
  if (settings.authorName) {
    embed.setAuthor({
      name: applyMemberPlaceholders(settings.authorName, member),
      ...(settings.authorIconUrl ? { iconURL: settings.authorIconUrl } : {}),
    });
  }

  return embed;
}

export function buildWelcomeEmbeds(settings, member) {
  const slots = settings.welcomeEmbeds?.filter((embed) => embed && (embed.title || embed.description)) ?? [];
  if (slots.length === 0) return [buildWelcomeEmbed(settings, member)];

  return slots.slice(0, 10).map((slot) => buildWelcomeEmbed({
    ...defaultWelcomeSettings,
    ...slot,
  }, member));
}