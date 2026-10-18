import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dataDirectory = fileURLToPath(new URL("../data/", import.meta.url));
const settingsPath = path.join(dataDirectory, "ticket-settings.json");
const saveQueues = new Map();

export const defaultTicketSettings = {
  panelChannelId: null,
  categoryId: null,
  staffRoleId: null,
  transcriptChannelId: null,
  panelMessageId: null,
  buttonLabel: "Create Ticket",
  buttonStyle: "Primary",
  panelEmbeds: [],
  ticketEmbed: {
    title: "Support Ticket",
    description: "Thanks for opening a ticket. Please describe how we can help.",
    color: "#00AAFF",
    fields: [],
  },
  openTickets: {},
};

async function readAllSettings() {
  try {
    return JSON.parse(await readFile(settingsPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

export async function getTicketSettings(guildId) {
  const allSettings = await readAllSettings();
  const saved = allSettings[guildId] ?? {};
  return {
    ...defaultTicketSettings,
    ...saved,
    ticketEmbed: {
      ...defaultTicketSettings.ticketEmbed,
      ...(saved.ticketEmbed ?? {}),
    },
    openTickets: { ...(saved.openTickets ?? {}) },
    panelEmbeds: [...(saved.panelEmbeds ?? [])],
  };
}

export async function updateTicketSettings(guildId, update) {
  const previous = saveQueues.get(guildId) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(async () => {
    const allSettings = await readAllSettings();
    const saved = allSettings[guildId] ?? {};
    const current = {
      ...defaultTicketSettings,
      ...saved,
      ticketEmbed: {
        ...defaultTicketSettings.ticketEmbed,
        ...(saved.ticketEmbed ?? {}),
      },
      openTickets: { ...(saved.openTickets ?? {}) },
      panelEmbeds: [...(saved.panelEmbeds ?? [])],
    };
    const next = await update(current);

    await mkdir(dataDirectory, { recursive: true });
    allSettings[guildId] = next;
    const temporaryPath = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(allSettings, null, 2)}\n`, "utf8");
    await rename(temporaryPath, settingsPath);
    return next;
  });

  saveQueues.set(guildId, pending);
  try {
    return await pending;
  } finally {
    if (saveQueues.get(guildId) === pending) saveQueues.delete(guildId);
  }
}