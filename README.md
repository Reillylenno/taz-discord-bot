# TAZ Discord Bot

## Requirements

- Node.js 20 or newer
- A Discord application with a bot added to the target server

## Configure

Add these entries to the existing local `.env` file. Keep any other settings already in that file, and do not share or commit the token.

```env
DISCORD_TOKEN=your_new_bot_token
CLIENT_ID=your_application_id
GUILD_ID=your_server_id
```

Reset the bot token in the Discord Developer Portal before using it: the previous token was shared in chat. `CLIENT_ID` is the application ID, and `GUILD_ID` is the server ID.

The bot needs the **Kick Members**, **Ban Members**, and **Moderate Members** permissions, and its highest role must be above the members it should moderate. For welcome messages, enable **Server Members Intent** under the bot's Privileged Gateway Intents in the Discord Developer Portal, then set `ENABLE_GUILD_MEMBERS_INTENT=true` in `.env` and restart the bot. Until both are enabled, the bot still starts and handles the existing commands, but Discord will not deliver member-join events. Make sure the application has the `bot` and `applications.commands` installation scopes.

## Run

From this folder, run:

```sh
npm install
npm run deploy-commands
npm start
```

`npm run deploy-commands` registers the command in the configured server. Keep the bot process running for commands to respond. Use `npm run restart` after code changes to stop the old process and start a replacement; if the bot is already stopped, it simply starts it. A second `npm start` is refused while another instance is running.

## Command

`/kick member reason`, `/ban member reason`, and `/mute member duration reason` send the member a direct message containing the moderator's reason, then perform the action. The DM is updated to confirm the action after it succeeds. Mute durations are 5, 10, or 30 minutes; 1, 2, or 3 hours; 5 hours; 1 or 5 days; or 1 week. If the bot cannot deliver the DM, it does not perform these actions. `/unmute member` removes an active timeout, then DMs the member to let them know; if their DMs are closed, the timeout is still removed and the moderator is notified. `/warn member reason` sends the warning and reason to the member's DMs; it requires the **Moderate Members** permission. Use `/moderation log channel` to choose a text channel for successful moderation-action embeds. This requires **Manage Server**, and the bot needs **View Channel**, **Send Messages**, and **Embed Links** in the selected channel.

The `/moderation` group also provides `kick`, `ban`, `mute`, `unmute`, `warn`, `setlog`, and `clearlog` subcommands. Successful actions are retained in a per-user moderation history; `/modlog user_id [limit]` shows the most recent entries (up to ten). History is local to this bot installation and retains up to 100 entries per user.

Use `/setwelcome channel` to configure a per-server welcome embed. Optional fields include `title`, `description`, `color`, `image_url`, `thumbnail_url`, `footer`, `footer_icon_url`, `author_name`, `author_icon_url`, `send_dm`, and `preview`. Use `{user}`, `{username}`, `{server}`, and `{memberCount}` in text fields for member-specific values. `preview: true` posts a preview in the channel where the command was run. `/setwelcomechannel channel` changes only the destination channel while preserving the rest of the welcome configuration. The bot needs **View Channel**, **Send Messages**, and **Embed Links** in the welcome channel.

`/editwelcome` opens an interactive editor for up to ten welcome embed slots, with preview and send-all controls. `/testwelcome` shows a private preview without changing settings; `/clearwelcome` disables future welcome sends while preserving the configured channel.

Ticket setup uses `/ticket setpanel`, `/ticket setcategory`, and `/ticket setstaff`, followed by `/ticket publish`. Members open private channels from the panel button; the configured staff role and ticket opener can view and manage them. `/ticket settranscript` selects where closing a ticket sends its text transcript. `/ticket editembeds` opens an interactive editor for up to ten panel embeds; `/ticket editticket` configures the embed used in new tickets. `/ticket clearpanels` is destructive: after confirmation it removes bot-authored panel-channel messages and clears all saved ticket settings and open-ticket records, but leaves existing ticket channels untouched. `/ticket resetembed` removes panel messages and resets embeds while preserving the configured channels, staff role, and open-ticket records. Ticket administration commands require **Manage Server**. The bot needs **Manage Channels**, **View Channel**, **Send Messages**, **Read Message History**, **Embed Links**, and **Attach Files** as applicable to the selected channels and ticket category.

Use `/editserverguide` to configure the guide embed and up to ten fields; members request it with `?serverguide`. This prefix command requires **Message Content Intent** in the Discord Developer Portal and `ENABLE_MESSAGE_CONTENT_INTENT=true` in `.env`.

`/automod enable`, `/automod disable`, `/automod addword`, `/automod removeword`, `/automod addlink`, `/automod removelink`, `/automod togglelinks`, `/automod setlogchannel`, and `/automod list` configure automatic message filtering. AutoMod also requires **Message Content Intent** in the Developer Portal and `ENABLE_MESSAGE_CONTENT_INTENT=true` in `.env`.

`/reactionroles` configures emoji reactions that toggle self-assignable roles. `/buttonroles` configures a published button menu. `/addrolebutton` and `/editrolebutton` manage role buttons on messages authored by this bot. The bot needs **Manage Roles**, and its highest role must be above every self-assignable role; reaction menus also require **Add Reactions** and **Read Message History**.

`/sendembed` opens a multi-slot editor for up to ten embeds, with preview and send/update controls. `/editembed` edits the first embed directly or opens the slot editor for a bot-authored message; `resend_to` copies the embeds. `/sendimage` sends an uploaded image attachment to a text channel.

`/setstreamer` and `/disabletwitch` manage live alerts. They require `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` in `.env`. `/twitchlink link` starts account verification by asking the user to place a one-time code in their Twitch profile description; `/twitchlink verify` completes it. For subscriber roles, configure `/twitchsubrole` and set `TWITCH_BROADCASTER_ID` and `TWITCH_BROADCASTER_TOKEN` locally; the token needs the `channel:read:subscriptions` scope.

`/commandaccess` can delegate `/automod`, `/moderation`, `/modlog`, `/ticket`, and `/twitchsubrole`. Native staff permissions continue to grant access; delegated access can be denied by role.