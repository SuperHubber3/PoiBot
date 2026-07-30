// The bot's invite URL, used as the embed author/URL link across counter commands.
export const INVITE_URL =
    'https://discord.com/api/oauth2/authorize?client_id=993069924362760202&permissions=275146730592&scope=bot%20applications.commands'

// The bot's own application/user id (used by legacy embed-parsing quirks).
// NOTE: the bot's own id is read from `container.client.user.id` at runtime —
// a constant here goes stale the moment the token changes.

// Guilds where test-only commands are registered (was `testServers` in wokcommands).
export const TEST_GUILDS = ['993084390722772992', '697026200769396736']

// Bot owner id(s) (was `botOwners`).
export const BOT_OWNERS = ['338760814884290562']

export const POI_EMOJI = '<:poi:1018591254356963458>'

/** Error shown when a user targets themselves with a command that disallows it. */
export const cantTargetSelf = (verb: string) => `You can't ${verb} yourself! ${POI_EMOJI}`
