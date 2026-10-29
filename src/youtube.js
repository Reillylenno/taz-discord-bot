import { EmbedBuilder, MessageFlags, PermissionFlagsBits } from "discord.js";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const settingsPath = path.join(fileURLToPath(new URL("../data/", import.meta.url)), "youtube-settings.json");
const channelIdPattern = /^UC[\w-]{22}$/;
let missingApiKeyLogged = false;

async function readState() {
  try {
    return JSON.parse(await readFile(settingsPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { guilds: {} };
    throw error;
  }
}

async function writeState(state) {
  await mkdir(path.dirname(settingsPath), { recursive: true });
  const temporaryPath = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporaryPath, settingsPath);
}

async function findLiveVideo(channelId) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    if (!missingApiKeyLogged) {
      console.warn("YouTube live alerts need YOUTUBE_API_KEY in .env.");
      missingApiKeyLogged = true;
    }
    return null;
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams({
    part: "snippet",
    channelId,
    eventType: "live",
    type: "video",
    maxResults: "1",
    key: apiKey,
  }).toString();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`YouTube API request failed (${response.status}).`);
  const data = await response.json();
  return data.items?.[0] ?? null;
}

export async function handleYouTubeCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply("You need Manage Server permission to configure YouTube live alerts.");
    return;
  }

  const state = await readState();
  if (interaction.commandName === "disableyoutube") {
    delete state.guilds[interaction.guildId];
    await writeState(state);
    await interaction.editReply("YouTube live notifications disabled.");
    return;
  }

  if (interaction.commandName !== "setyoutube") return;
  if (!process.env.YOUTUBE_API_KEY) {
    await interaction.editReply("YouTube alerts are unavailable until YOUTUBE_API_KEY is added to the bot's .env file.");
    return;
  }

  const channelId = interaction.options.getString("channel_id", true);
  const channel = interaction.options.getChannel("channel", true);
  if (!channelIdPattern.test(channelId)) {
    await interaction.editReply("Enter a valid YouTube channel ID, which starts with UC and is 24 characters long.");
    return;
  }
  if (!channel.isTextBased() || channel.guildId !== interaction.guildId) {
    await interaction.editReply("Choose a text channel in this server.");
    return;
  }

  state.guilds[interaction.guildId] = {
    channelId,
    discordChannelId: channel.id,
    lastLiveVideoId: null,
  };
  await writeState(state);
  await interaction.editReply(`YouTube live notifications for channel \`${channelId}\` will be sent to <#${channel.id}>.`);
}

export async function pollYouTubeLiveStreams(client) {
  const state = await readState();
  let stateChanged = false;
  const liveVideosByChannel = new Map();

  for (const [guildId, config] of Object.entries(state.guilds)) {
    if (!config.channelId || !config.discordChannelId) continue;

    try {
      if (!liveVideosByChannel.has(config.channelId)) {
        liveVideosByChannel.set(config.channelId, await findLiveVideo(config.channelId));
      }
      const live = liveVideosByChannel.get(config.channelId);
      const videoId = live?.id?.videoId ?? null;
      if (!videoId) {
        if (config.lastLiveVideoId) {
          config.lastLiveVideoId = null;
          stateChanged = true;
        }
        continue;
      }
      if (config.lastLiveVideoId === videoId) continue;

      const channel = await client.channels.fetch(config.discordChannelId);
      if (!channel?.isTextBased()) continue;

      const title = live.snippet.title || `${live.snippet.channelTitle} is live`;
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(title)
        .setURL(videoUrl)
        .setDescription(`**${live.snippet.channelTitle} is live on YouTube!**`)
        .setTimestamp(new Date(live.snippet.publishedAt));
      await channel.send({ content: videoUrl, embeds: [embed], allowedMentions: { parse: [] } });
      config.lastLiveVideoId = videoId;
      stateChanged = true;
    } catch (error) {
      console.error(`YouTube live poll failed for server ${guildId}:`, error);
    }
  }

  if (stateChanged) await writeState(state);
}
