import { EmbedBuilder } from "discord.js";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dataDirectory = fileURLToPath(new URL("../data/", import.meta.url));
const settingsPath = path.join(dataDirectory, "server-guides.json");

export const defaultServerGuide = {
  title: "Server Guide",
  description: "Welcome! Read the information below to get started.",
  color: "#5865F2",
  footer: "Please follow the server rules.",
  fields: [],
};

export async function getServerGuide(guildId) {
  try {
    const settings = JSON.parse(await readFile(settingsPath, "utf8"));
    return { ...defaultServerGuide, ...(settings[guildId] ?? {}) };
  } catch (error) {
    if (error.code === "ENOENT") return { ...defaultServerGuide };
    throw error;
  }
}

export async function saveServerGuide(guildId, guide) {
  await mkdir(dataDirectory, { recursive: true });
  let settings = {};
  try {
    settings = JSON.parse(await readFile(settingsPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  settings[guildId] = guide;
  const temporaryPath = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await rename(temporaryPath, settingsPath);
}

export function buildServerGuide(guide) {
  const embed = new EmbedBuilder()
    .setColor(Number.parseInt(guide.color.replace(/^#/, ""), 16))
    .setTitle(guide.title)
    .setDescription(guide.description);
  if (guide.footer) embed.setFooter({ text: guide.footer });
  if (guide.fields.length) embed.addFields(guide.fields.map((field) => ({ ...field, inline: false })));
  return embed;
}