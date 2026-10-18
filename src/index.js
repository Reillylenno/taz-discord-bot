import "dotenv/config";
import { Client, Collection, Events, GatewayIntentBits, MessageFlags, Partials, PermissionFlagsBits } from "discord.js";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import lockfile from "proper-lockfile";
import * as banCommand from "../commands/moderation/ban.js";
import * as automodCommand from "../commands/automod.js";
import * as buttonRolesCommand from "../commands/buttonroles.js";
import * as addRoleButtonCommand from "../commands/addrolebutton.js";
import * as editRoleButtonCommand from "../commands/editrolebutton.js";
import * as editEmbedCommand from "../commands/editembed.js";
import * as clearWelcomeCommand from "../commands/clearwelcome.js";
import * as commandAccessCommand from "../commands/commandaccess.js";
import * as disableTwitchCommand from "../commands/disabletwitch.js";
import * as editWelcomeCommand from "../commands/editwelcome.js";
import * as editServerGuideCommand from "../commands/editserverguide.js";
import * as twitchLinkCommand from "../commands/twitchlink.js";
import * as twitchSubRoleCommand from "../commands/twitchsubrole.js";
import * as setStreamerCommand from "../commands/setstreamer.js";
import * as kickCommand from "../commands/moderation/kick.js";
import * as moderationCommand from "../commands/moderation/moderation.js";
import * as modlogCommand from "../commands/modlog.js";
import * as muteCommand from "../commands/moderation/mute.js";
import * as setWelcomeCommand from "../commands/setwelcome.js";
import * as setWelcomeChannelCommand from "../commands/setwelcomechannel.js";
import * as reactionRolesCommand from "../commands/reactionroles.js";
import * as testWelcomeCommand from "../commands/testwelcome.js";
import * as sendEmbedCommand from "../commands/sendembed.js";
import * as sendImageCommand from "../commands/sendimage.js";
import * as ticketCommand from "../commands/ticket.js";
import * as unmuteCommand from "../commands/moderation/unmute.js";
import * as warnCommand from "../commands/moderation/warn.js";
import { controlPath, lockTarget } from "./instance-paths.js";
import { buildWelcomeEmbeds, getWelcomeSettings } from "./welcome-settings.js";
import { handleWelcomeComponent } from "./welcome-editor.js";
import { handleTicketComponent } from "./ticket-system.js";
import { buildServerGuide, getServerGuide } from "./server-guide.js";
import { moderateMessage } from "./automod.js";
import { pollLiveStreams } from "./twitch.js";
import { handleRoleButton, handleRoleReaction } from "./role-menus.js";
import { handleEmbedToolComponent } from "./embed-tools.js";
import { hasCommandAccess } from "./command-access.js";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  throw new Error("DISCORD_TOKEN is missing. Add it to your local .env file.");
}

let releaseLock;

try {
  const retries = process.env.BOT_RESTART === "1"
    ? { retries: 25, factor: 1, minTimeout: 500, maxTimeout: 500 }
    : 0;
  releaseLock = await lockfile.lock(lockTarget, { retries, realpath: false });
} catch (error) {
  if (error.code === "ELOCKED") {
    console.error("The bot is already running; refusing to start another instance.");
    process.exit(1);
  }
  throw error;
}

const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions];
if (process.env.ENABLE_GUILD_MEMBERS_INTENT === "true") {
  intents.push(GatewayIntentBits.GuildMembers);
}
if (process.env.ENABLE_MESSAGE_CONTENT_INTENT === "true") {
  intents.push(GatewayIntentBits.MessageContent);
}
const client = new Client({
  intents,
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});
const commands = new Collection([
  [kickCommand.data.name, kickCommand],
  [commandAccessCommand.data.name, commandAccessCommand],
  [automodCommand.data.name, automodCommand],
  [reactionRolesCommand.data.name, reactionRolesCommand],
  [buttonRolesCommand.data.name, buttonRolesCommand],
  [addRoleButtonCommand.data.name, addRoleButtonCommand],
  [editRoleButtonCommand.data.name, editRoleButtonCommand],
  [sendEmbedCommand.data.name, sendEmbedCommand],
  [editEmbedCommand.data.name, editEmbedCommand],
  [sendImageCommand.data.name, sendImageCommand],
  [banCommand.data.name, banCommand],
  [muteCommand.data.name, muteCommand],
  [unmuteCommand.data.name, unmuteCommand],
  [warnCommand.data.name, warnCommand],
  [moderationCommand.data.name, moderationCommand],
  [modlogCommand.data.name, modlogCommand],
  [setWelcomeCommand.data.name, setWelcomeCommand],
  [setWelcomeChannelCommand.data.name, setWelcomeChannelCommand],
  [clearWelcomeCommand.data.name, clearWelcomeCommand],
  [testWelcomeCommand.data.name, testWelcomeCommand],
  [editWelcomeCommand.data.name, editWelcomeCommand],
  [editServerGuideCommand.data.name, editServerGuideCommand],
  [setStreamerCommand.data.name, setStreamerCommand],
  [disableTwitchCommand.data.name, disableTwitchCommand],
  [twitchLinkCommand.data.name, twitchLinkCommand],
  [twitchSubRoleCommand.data.name, twitchSubRoleCommand],
  [ticketCommand.data.name, ticketCommand],
]);
let shuttingDown = false;
let controlServer;
let httpServer;

client.on(Events.ShardConnecting, (shardId) => {
  console.log(`Connecting Discord gateway shard ${shardId}.`);
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  void pollLiveStreams(client);
  const twitchPoll = setInterval(() => void pollLiveStreams(client), 60_000);
  twitchPoll.unref();
});

client.on(Events.Error, (error) => {
  console.error("Discord client error:", error);
});

client.on(Events.ShardError, (error, shardId) => {
  console.error(`Discord gateway shard ${shardId} error:`, error);
});

client.on(Events.ShardDisconnect, (closeEvent, shardId) => {
  console.error(`Discord gateway shard ${shardId} disconnected (code ${closeEvent.code}): ${closeEvent.reason || "no reason provided"}`);
});

client.on(Events.ShardReconnecting, (shardId) => {
  console.warn(`Discord gateway shard ${shardId} is reconnecting.`);
});

client.on(Events.ShardReady, (shardId) => {
  console.log(`Discord gateway shard ${shardId} is ready.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = commands.get(interaction.commandName);
    if (command?.autocomplete) {
      await command.autocomplete(interaction).catch(() => interaction.respond([]).catch(() => {}));
    }
    return;
  }

  if (!interaction.isChatInputCommand()) {
    try {
      const handledByEmbed = await handleEmbedToolComponent(interaction);
      const handledByRole = handledByEmbed ? true : await handleRoleButton(interaction);
      const handledByWelcome = handledByRole ? true : await handleWelcomeComponent(interaction);
      if (!handledByWelcome) await handleTicketComponent(interaction);
    } catch (error) {
      console.error("Ticket interaction failed:", error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("The ticket action failed. Please try again or contact staff.").catch(() => {});
      } else if (interaction.isRepliable()) {
        await interaction.reply({
          content: "The ticket action failed. Please try again or contact staff.",
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
    }
    return;
  }

  const command = commands.get(interaction.commandName);
  if (!command) return;

  const delegatedPermissions = {
    automod: PermissionFlagsBits.ManageGuild,
    moderation: [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages],
    modlog: PermissionFlagsBits.ManageMessages,
    ticket: PermissionFlagsBits.ManageGuild,
    twitchsubrole: PermissionFlagsBits.ManageGuild,
  };
  const nativePermissions = delegatedPermissions[interaction.commandName];
  if (nativePermissions && !await hasCommandAccess(interaction, interaction.commandName, nativePermissions)) {
    await interaction.reply({
      content: "You don't have permission to use this command. Ask a server manager to grant access.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Command /${interaction.commandName} failed:`, error);
    const response = "Something went wrong while running that command.";

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(response).catch(() => {});
    } else {
      await interaction.reply({ content: response, ephemeral: true }).catch(() => {});
    }
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const settings = await getWelcomeSettings(member.guild.id);
    if (!settings?.channelId || settings.cleared) return;

    const channel = await member.guild.channels.fetch(settings.channelId);
    if (!channel?.isTextBased() || channel.guildId !== member.guild.id) {
      console.error(`Configured welcome channel is invalid for server ${member.guild.id}.`);
      return;
    }

    const embeds = buildWelcomeEmbeds(settings, member);
    try {
      await channel.send({ embeds, allowedMentions: { parse: [] } });
    } catch (error) {
      console.error(`Could not post welcome message for server ${member.guild.id}:`, error);
    }

    if (settings.sendDm) {
      try {
        await member.send({ embeds, allowedMentions: { parse: [] } });
      } catch (error) {
        console.error(`Could not DM welcome message to member ${member.id}:`, error);
      }
    }
  } catch (error) {
    console.error(`Could not process welcome message for member ${member.id}:`, error);
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (process.env.ENABLE_MESSAGE_CONTENT_INTENT !== "true" || message.author.bot || !message.guild) return;
  if (message.content.trim().toLowerCase() !== "?serverguide") return;
  try {
    const guide = await getServerGuide(message.guild.id);
    await message.channel.send({ embeds: [buildServerGuide(guide)] });
  } catch (error) {
    console.error("Could not send the server guide:", error);
  }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    await handleRoleReaction(reaction, user, true);
  } catch (error) {
    console.error("Could not assign reaction role:", error);
  }
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  try {
    await handleRoleReaction(reaction, user, false);
  } catch (error) {
    console.error("Could not remove reaction role:", error);
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (process.env.ENABLE_MESSAGE_CONTENT_INTENT !== "true") return;
  try {
    await moderateMessage(message);
  } catch (error) {
    console.error("AutoMod message handler failed:", error);
  }
});

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down.`);
  client.destroy();
  await Promise.all([
    controlServer?.listening ? new Promise((resolve) => controlServer.close(resolve)) : Promise.resolve(),
    httpServer?.listening ? new Promise((resolve) => httpServer.close(resolve)) : Promise.resolve(),
  ]);
  await releaseLock();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  const port = process.env.PORT ? Number(process.env.PORT) : null;
  if (port !== null) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("PORT must be a valid TCP port.");
    }
    httpServer = createHttpServer((request, response) => {
      if (request.method === "GET" && (request.url === "/" || request.url === "/healthz")) {
        response.writeHead(client.isReady() ? 200 : 503, { "content-type": "text/plain; charset=utf-8" });
        response.end(client.isReady() ? "Bot is online\n" : "Bot is starting\n");
        return;
      }
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found\n");
    });
    await new Promise((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(port, "0.0.0.0", resolve);
    });
    console.log(`Health server listening on port ${port}.`);
  }

  controlServer = createServer((socket) => {
    let request = "";
    socket.on("data", (chunk) => {
      request += chunk.toString();
      if (!request.includes("\n")) return;

      if (request.trim() !== "restart") {
        socket.end("unsupported\n");
        return;
      }

      if (shuttingDown) {
        socket.end("already-stopping\n");
        return;
      }

      shuttingDown = true;
      console.log("Received restart request; shutting down before replacement.");
      client.destroy();
      void releaseLock().then(() => {
        socket.end("restarting\n", () => process.exit(0));
      });
    });
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      controlServer.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      controlServer.off("error", onError);
      resolve();
    };
    controlServer.once("error", onError);
    controlServer.once("listening", onListening);
    controlServer.listen(controlPath);
  });

  console.log("Connecting to Discord gateway.");
  let loginTimeout;
  try {
    await Promise.race([
      client.login(token),
      new Promise((_, reject) => {
        loginTimeout = setTimeout(() => reject(new Error("Timed out waiting for the Discord gateway connection.")), 60_000);
      }),
    ]);
  } finally {
    clearTimeout(loginTimeout);
  }
} catch (error) {
  client.destroy();
  if (controlServer?.listening) {
    await new Promise((resolve) => controlServer.close(resolve));
  }
  if (httpServer?.listening) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  await releaseLock();
  throw error;
}