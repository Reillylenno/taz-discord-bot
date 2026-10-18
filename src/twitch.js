import { randomBytes } from "node:crypto";
import { EmbedBuilder, MessageFlags, PermissionFlagsBits } from "discord.js";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasCommandAccess } from "./command-access.js";

const settingsPath = path.join(fileURLToPath(new URL("../data/", import.meta.url)), "twitch-settings.json");
let cachedToken;
let tokenExpiresAt = 0;
let missingCredentialsLogged = false;

async function readState() {
  try {
    return JSON.parse(await readFile(settingsPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { guilds: {}, users: {}, pending: {} };
    throw error;
  }
}

async function writeState(state) {
  await mkdir(path.dirname(settingsPath), { recursive: true });
  const temporaryPath = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporaryPath, settingsPath);
}

async function getAppToken() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    if (!missingCredentialsLogged) {
      console.warn("Twitch commands need TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env.");
      missingCredentialsLogged = true;
    }
    return null;
  }
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
  });
  if (!response.ok) throw new Error(`Twitch token request failed (${response.status}).`);
  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function helix(pathname, params = {}, token = null) {
  const accessToken = token ?? await getAppToken();
  if (!accessToken) return null;
  const url = new URL(`https://api.twitch.tv/helix/${pathname}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: {
      "Client-Id": process.env.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) throw new Error(`Twitch API request failed (${response.status}).`);
  return response.json();
}

async function lookupTwitchUser(login) {
  const result = await helix("users", { login });
  return result?.data?.[0] ?? null;
}

async function tryAssignSubscriberRole(interaction, twitchId) {
  const state = await readState();
  const config = state.guilds[interaction.guildId];
  const token = process.env.TWITCH_BROADCASTER_TOKEN;
  const broadcasterId = process.env.TWITCH_BROADCASTER_ID;
  if (!config?.subscriberRoleId || !token || !broadcasterId) return "Subscriber role check is not configured.";

  const result = await helix("subscriptions/user", {
    broadcaster_id: broadcasterId,
    user_id: twitchId,
  }, token);
  const subscribed = Boolean(result?.data?.length);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const role = await interaction.guild.roles.fetch(config.subscriberRoleId);
  if (!role?.editable) return "The subscriber role is not manageable by the bot.";
  if (subscribed) {
    await member.roles.add(role);
    return `Subscriber role <@&${role.id}> assigned.`;
  }
  await member.roles.remove(role).catch(() => {});
  return "The linked Twitch account is not an active channel subscriber.";
}

export async function handleTwitchCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const state = await readState();
  const guildConfig = state.guilds[interaction.guildId] ?? {};
  const action = interaction.isChatInputCommand() && ["setstreamer", "disabletwitch", "twitchsubrole"].includes(interaction.commandName)
    ? interaction.commandName
    : interaction.options.getSubcommand();

  if (action === "setstreamer") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.editReply("You need Manage Server permission to configure stream alerts.");
      return;
    }
    const login = interaction.options.getString("streamer", true).toLowerCase();
    const channel = interaction.options.getChannel("channel", true);
    if (!channel.isTextBased() || channel.guildId !== interaction.guildId) {
      await interaction.editReply("Choose a text channel in this server.");
      return;
    }
    if (!/^[a-z0-9_]{3,25}$/.test(login)) {
      await interaction.editReply("Enter a valid Twitch username.");
      return;
    }
    const twitchUser = await lookupTwitchUser(login);
    if (!twitchUser) {
      await interaction.editReply("I couldn't find that Twitch account. Check the username and Twitch API credentials.");
      return;
    }
    state.guilds[interaction.guildId] = { ...guildConfig, streamer: twitchUser.login, channelId: channel.id, lastLiveId: null };
    await writeState(state);
    await interaction.editReply(`Live notifications for **${twitchUser.display_name}** will be sent to <#${channel.id}>.`);
    return;
  }

  if (action === "disabletwitch") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.editReply("You need Manage Server permission to disable stream alerts.");
      return;
    }
    state.guilds[interaction.guildId] = { ...guildConfig, streamer: null, channelId: null, lastLiveId: null };
    await writeState(state);
    await interaction.editReply("Twitch live notifications disabled.");
    return;
  }

  if (action === "twitchsubrole") {
    if (!await hasCommandAccess(interaction, "twitchsubrole", PermissionFlagsBits.ManageGuild)) {
      await interaction.editReply("You need Manage Server permission to set the subscriber role.");
      return;
    }
    const role = interaction.options.getRole("role", true);
    const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) || !role.editable) {
      await interaction.editReply("I need Manage Roles and a role hierarchy above the subscriber role.");
      return;
    }
    state.guilds[interaction.guildId] = { ...guildConfig, subscriberRoleId: role.id };
    await writeState(state);
    await interaction.editReply(`Subscriber role set to <@&${role.id}>.`);
    return;
  }

  if (action === "link") {
    const login = interaction.options.getString("username", true).toLowerCase();
    if (!/^[a-z0-9_]{3,25}$/.test(login)) {
      await interaction.editReply("Enter a valid Twitch username.");
      return;
    }
    const twitchUser = await lookupTwitchUser(login);
    if (!twitchUser) {
      await interaction.editReply("I couldn't find that Twitch account. Check the username and Twitch API credentials.");
      return;
    }
    const code = `TAZ-${randomBytes(4).toString("hex").toUpperCase()}`;
    state.pending[interaction.user.id] = { twitchId: twitchUser.id, login: twitchUser.login, code, expiresAt: Date.now() + 15 * 60 * 1000 };
    await writeState(state);
    await interaction.editReply(`To verify you own **${twitchUser.display_name}**, add this code to your Twitch profile description: \`${code}\`. Then run /twitchlink verify within 15 minutes.`);
    return;
  }

  if (action === "verify") {
    const pending = state.pending[interaction.user.id];
    if (!pending || pending.expiresAt < Date.now()) {
      delete state.pending[interaction.user.id];
      await writeState(state);
      await interaction.editReply("No current Twitch verification. Start with /twitchlink link username.");
      return;
    }
    const twitchUser = await helix("users", { id: pending.twitchId });
    if (!twitchUser?.data?.[0]?.description?.includes(pending.code)) {
      await interaction.editReply("I couldn't find the verification code in that Twitch profile description yet.");
      return;
    }
    state.users[interaction.user.id] = { twitchId: pending.twitchId, login: pending.login, verifiedAt: new Date().toISOString() };
    delete state.pending[interaction.user.id];
    await writeState(state);
    let roleMessage = "";
    try {
      roleMessage = ` ${await tryAssignSubscriberRole(interaction, pending.twitchId)}`;
    } catch (error) {
      console.error("Could not check Twitch subscriber role:", error);
      roleMessage = " Subscriber role check failed; verify broadcaster token settings.";
    }
    await interaction.editReply(`Linked Twitch account **${pending.login}**.${roleMessage}`);
    return;
  }

  if (action === "status") {
    const linked = state.users[interaction.user.id];
    await interaction.editReply(linked
      ? `Linked Twitch account: **${linked.login}** (verified).`
      : "You have not linked a verified Twitch account.");
  }
}

export async function pollLiveStreams(client) {
  const state = await readState();
  for (const [guildId, config] of Object.entries(state.guilds)) {
    if (!config.streamer || !config.channelId) continue;
    try {
      const result = await helix("streams", { user_login: config.streamer });
      const live = result?.data?.[0];
      if (!live) {
        if (config.lastLiveId) {
          config.lastLiveId = null;
          state.guilds[guildId] = config;
        }
        continue;
      }
      if (config.lastLiveId === live.id) continue;
      const channel = await client.channels.fetch(config.channelId);
      if (!channel?.isTextBased()) continue;
      const embed = new EmbedBuilder()
        .setColor(0x9146ff)
        .setTitle(live.title || `${live.user_name} is live`)
        .setURL(`https://twitch.tv/${live.user_login}`)
        .setDescription(`**${live.user_name} is live on Twitch!**\n${live.game_name || ""}`)
        .setImage(live.thumbnail_url.replace("{width}", "1280").replace("{height}", "720"))
        .setTimestamp(new Date(live.started_at));
      await channel.send({ content: `https://twitch.tv/${live.user_login}`, embeds: [embed], allowedMentions: { parse: [] } });
      config.lastLiveId = live.id;
      state.guilds[guildId] = config;
    } catch (error) {
      console.error(`Twitch poll failed for server ${guildId}:`, error);
    }
  }
  await writeState(state);
}

export async function runSubscriberRoleCheck(interaction) {
  const state = await readState();
  const linked = state.users[interaction.user.id];
  if (!linked) return "Link and verify a Twitch account first with /twitchlink link.";
  return tryAssignSubscriberRole(interaction, linked.twitchId);
}