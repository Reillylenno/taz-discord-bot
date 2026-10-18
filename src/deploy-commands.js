import "dotenv/config";
import { REST, Routes } from "discord.js";
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

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  throw new Error("Set DISCORD_TOKEN, CLIENT_ID, and GUILD_ID in your local .env file.");
}

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
  body: [
    kickCommand.data.toJSON(),
    commandAccessCommand.data.toJSON(),
    automodCommand.data.toJSON(),
    reactionRolesCommand.data.toJSON(),
    buttonRolesCommand.data.toJSON(),
    addRoleButtonCommand.data.toJSON(),
    editRoleButtonCommand.data.toJSON(),
    sendEmbedCommand.data.toJSON(),
    editEmbedCommand.data.toJSON(),
    sendImageCommand.data.toJSON(),
    banCommand.data.toJSON(),
    muteCommand.data.toJSON(),
    unmuteCommand.data.toJSON(),
    warnCommand.data.toJSON(),
    moderationCommand.data.toJSON(),
    modlogCommand.data.toJSON(),
    setWelcomeCommand.data.toJSON(),
    setWelcomeChannelCommand.data.toJSON(),
    clearWelcomeCommand.data.toJSON(),
    testWelcomeCommand.data.toJSON(),
    editWelcomeCommand.data.toJSON(),
    editServerGuideCommand.data.toJSON(),
    setStreamerCommand.data.toJSON(),
    disableTwitchCommand.data.toJSON(),
    twitchLinkCommand.data.toJSON(),
    twitchSubRoleCommand.data.toJSON(),
    ticketCommand.data.toJSON(),
  ],
});

console.log(`Registered moderation commands in server ${GUILD_ID}.`);