import './lib/setup.js'

import { ApplicationCommandRegistries, LogLevel, RegisterBehavior, SapphireClient } from '@sapphire/framework'
import { GatewayIntentBits, Partials } from 'discord.js'
import mongoose from 'mongoose'
import path from 'path'
import { fileURLToPath } from 'url'
import { BOT_OWNERS } from './lib/constants.js'
import { getGuildLanguage } from './lib/functions/guild-language.js'
import { initLavalink } from './lib/services/lavalink.service.js'
import { seedAwardDefinitions } from './lib/services/award-system.service.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Bulk-overwrite every scope on startup: Discord ends up with exactly the commands
// this bot defines, deleting any leftovers (e.g. from the old wokcommands setup).
ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(RegisterBehavior.BulkOverwrite)

// // Keep the bot alive on stray errors (mirrors the old top-level handler).
// process.on('uncaughtException', (err) => {
//     console.error(err)
//     if (err.message === 'Interaction has already been acknowledged.') return
//     console.log('Node NOT Exiting...')
// })

const client = new SapphireClient({
    // Load pieces from the tree we are actually running from. Sapphire otherwise
    // derives this from package.json "main" (dist/), so `npm run dev` would run
    // src/ but load commands out of dist/ — giving every shared module TWO
    // instances and silently splitting module-level state.
    baseUserDirectory: __dirname,
    defaultPrefix: 'poi ',
    // Mentions now start natural chat; commands still use the poi prefix.
    disableMentionPrefix: true,
    caseInsensitiveCommands: true,
    // Prefix commands need MessageContent (a privileged intent) — enable it in the
    // Discord Developer Portal too, or every `poi ...` command and message listener
    // will silently receive empty content.
    loadMessageCommandListeners: true,
    logger: { level: LogLevel.Info },
    // Bot owners bypass every command cooldown.
    defaultCooldown: { filteredUsers: BOT_OWNERS },
    // Per-guild language (en-US / tr-TR), stored in guild-settings; see /language command.
    i18n: {
        defaultLanguageDirectory: path.join(__dirname, '..', 'languages'),
        fetchLanguage: async (context) => getGuildLanguage(context.guild?.id),
    },
    intents: [
        GatewayIntentBits.AutoModerationConfiguration,
        GatewayIntentBits.AutoModerationExecution,
        GatewayIntentBits.DirectMessagePolls,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildExpressions,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessagePolls,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.MessageContent,
    ],
    // Needed to receive DMs (uncached DM channels) for the DM-redirect listener.
    partials: [Partials.Channel, Partials.Message],
})

async function main() {
    try {
        if (process.env.MONGO_URI) {
            await mongoose.connect(process.env.MONGO_URI)
            await seedAwardDefinitions()
            client.logger.info('Connected to MongoDB')
        } else {
            client.logger.warn('MONGO_URI not set. Every database-backed command will fail.')
        }
        // Must be created before login so Shoukaku sees the raw voice gateway events.
        initLavalink()
        await client.login(process.env.DISCORD_TOKEN)
    } catch (error) {
        client.logger.fatal(error)
        await client.destroy()
        process.exit(1)
    }
}

main()

export default client
