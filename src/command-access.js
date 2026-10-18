import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const settingsPath = path.join(fileURLToPath(new URL("../data/", import.meta.url)), "command-access.json");
export const delegatableCommands = ["automod", "moderation", "modlog", "ticket", "twitchsubrole"];

async function readSettings() {
  try {
    return JSON.parse(await readFile(settingsPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

export async function hasCommandAccess(interaction, commandName, nativePermissions = []) {
  const permissions = Array.isArray(nativePermissions) ? nativePermissions : [nativePermissions];
  if (permissions.some((permission) => permission && interaction.memberPermissions?.has(permission))) return true;
  const allSettings = await readSettings();
  const config = allSettings[interaction.guildId] ?? { allowed: [], deniedRoles: {} };
  if (!config.allowed.includes(commandName)) return false;
  const roles = Array.isArray(interaction.member?.roles)
    ? interaction.member.roles
    : interaction.member?.roles?.cache?.keys?.() ?? [];
  const denied = config.deniedRoles?.[commandName] ?? [];
  return ![...roles].some((roleId) => denied.includes(roleId));
}

export async function handleCommandAccessAutocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  await interaction.respond(delegatableCommands
    .filter((name) => name.includes(focused))
    .map((name) => ({ name: `/${name}`, value: name })));
}

export async function executeCommandAccess(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply("You need Manage Server permission to delegate command access.");
    return;
  }
  const allSettings = await readSettings();
  const config = allSettings[interaction.guildId] ?? { allowed: [], deniedRoles: {} };
  const action = interaction.options.getSubcommand();
  if (action === "available") {
    await interaction.editReply(`Delegatable commands: ${delegatableCommands.map((name) => `/${name}`).join(", ")}.`);
    return;
  }
  if (action === "list") {
    const allowed = config.allowed.length ? config.allowed.map((name) => `/${name}`).join(", ") : "None";
    await interaction.editReply(`Commands delegated to members: ${allowed}.`);
    return;
  }

  const commandName = interaction.options.getString("command", true);
  if (!delegatableCommands.includes(commandName)) {
    await interaction.editReply("Choose a command from /commandaccess available.");
    return;
  }
  if (action === "allow" || action === "revoke") {
    const allowed = new Set(config.allowed);
    if (action === "allow") allowed.add(commandName);
    else allowed.delete(commandName);
    config.allowed = [...allowed];
    if (action === "revoke") delete config.deniedRoles[commandName];
    allSettings[interaction.guildId] = config;
    await writeSettings(allSettings);
    await interaction.editReply(`${action === "allow" ? "Delegated" : "Revoked delegation for"} /${commandName}. Native staff permissions still work.`);
    return;
  }
  if (action === "denyrole" || action === "allowrole") {
    const role = interaction.options.getRole("role", true);
    const deniedRoles = new Set(config.deniedRoles[commandName] ?? []);
    if (action === "denyrole") deniedRoles.add(role.id);
    else deniedRoles.delete(role.id);
    config.deniedRoles[commandName] = [...deniedRoles];
    allSettings[interaction.guildId] = config;
    await writeSettings(allSettings);
    await interaction.editReply(`${action === "denyrole" ? "Denied" : "Allowed"} role <@&${role.id}> for /${commandName}.`);
    return;
  }
  if (action === "rolelist") {
    const roleIds = config.deniedRoles[commandName] ?? [];
    await interaction.editReply(roleIds.length
      ? `Roles denied /${commandName}: ${roleIds.map((roleId) => `<@&${roleId}>`).join(", ")}.`
      : `No roles are specifically denied from /${commandName}.`);
  }
}

async function writeSettings(settings) {
  await mkdir(path.dirname(settingsPath), { recursive: true });
  const temporaryPath = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await rename(temporaryPath, settingsPath);
}