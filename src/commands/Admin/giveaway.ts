import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import {
    ChatInputCommandInteraction,
    Message,
    MessageFlags,
    PermissionFlagsBits,
    SendableChannels,
    User,
} from 'discord.js'
import { sendable } from '../../lib/util/send.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'
import sessionSchema from '../../lib/models/session-schema.js'
import { sessions } from '../../lib/util/session-store.js'

const DEFAULT_EMOJI = '🎉'
const GIVEAWAY_TTL_MS = 1000 * 60 * 60 * 24 * 30

interface GiveawayRecord {
    messageId: string
    emoji: string
    winnerId?: string
}

/**
 * Reaction giveaways, as the original worked: `start` reacts to the most recent
 * message in the channel with the entry emoji, `end` fetches that message's
 * reactors and picks a random non-bot winner.
 *
 * The original hardcoded a single channel id for `end`; that restriction is
 * dropped, since it only made sense on the server it was written for.
 */
@ApplyOptions<Command.Options>({
    name: 'giveaway',
    aliases: ['startgiveaway', 'endgiveaway'],
    description: 'Start or end a reaction giveaway on the latest message',
    runIn: 'GUILD_ANY',
    requiredUserPermissions: [PermissionFlagsBits.Administrator],
})
export class GiveawayCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) =>
            guildOnly(b)
                .setName('giveaway')
                .setDescription('Start or end a reaction giveaway on the latest message')
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
                .addSubcommand((s) =>
                    s
                        .setName('start')
                        .setDescription('React to the latest message so people can enter')
                        .addStringOption((o) =>
                            o.setName('emoji').setDescription(`Entry emoji (default ${DEFAULT_EMOJI})`)
                        )
                )
                .addSubcommand((s) => s.setName('end').setDescription('Draw a winner from the latest message'))
        )
    }

    public override async messageRun(message: Message, args: Args) {
        // `poi endgiveaway` has no "end" argument — the verb is in the alias. Reading
        // the subcommand purely from args made it fall through to the default and
        // *start* a giveaway instead of drawing a winner.
        const invoked = (args.commandContext.commandName ?? '').toLowerCase()
        const sub = invoked.startsWith('end')
            ? 'end'
            : invoked.startsWith('start')
              ? 'start'
              : (await args.pick('string').catch(() => 'start')).toLowerCase()

        const emoji = await args.pick('string').catch(() => DEFAULT_EMOJI)
        const channel = sendable(message)
        const text =
            sub === 'end'
                ? await this.end(message, channel)
                : await this.start(message, channel, emoji)
        await message.reply(v2(text))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const channel = interaction.channel
        if (!channel?.isSendable()) {
            await interaction.reply(v2(await resolveKey(interaction, 'misc:giveawayNoMessage'), { ephemeral: true }))
            return
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const sub = interaction.options.getSubcommand()
        const text =
            sub === 'end'
                ? await this.end(interaction, channel)
                : await this.start(interaction, channel, interaction.options.getString('emoji') ?? DEFAULT_EMOJI)
        // Ephemeral so the winner announcement stays the visible message.
        await interaction.editReply(v2(text))
    }

    /** Reacts to the newest message in the channel with the entry emoji. */
    private async start(
        ctx: Message | ChatInputCommandInteraction,
        channel: SendableChannels,
        rawEmoji: string
    ) {
        const target = await this.latestMessage(ctx, channel)
        if (!target) return resolveKey(ctx, 'misc:giveawayNoMessage')

        // `:name:` refers to a custom emoji on this server.
        const named = rawEmoji.match(/^:?([\w-]+):?$/)
        const custom = named ? ctx.guild!.emojis.cache.find((e) => e.name === named[1]) : null
        const emoji = custom ?? rawEmoji

        try {
            const reaction = await target.react(emoji as any)
            await sessions.create<GiveawayRecord>(
                this.recordKey(ctx),
                {
                    messageId: target.id,
                    emoji: reaction.emoji.id ?? reaction.emoji.name ?? rawEmoji,
                },
                { persist: true, ttlMs: GIVEAWAY_TTL_MS }
            )
        } catch {
            return resolveKey(ctx, 'misc:giveawayBadEmoji')
        }
        return resolveKey(ctx, 'misc:giveawayStarted')
    }

    /** Picks a random non-bot reactor of the newest message. */
    private async end(ctx: Message | ChatInputCommandInteraction, channel: SendableChannels) {
        const record = await sessions.get<GiveawayRecord>(this.recordKey(ctx))
        if (!record) return resolveKey(ctx, 'misc:giveawayNoMessage')

        let winnerId = record.winnerId
        if (!winnerId) {
            const target = await channel.messages.fetch(record.messageId).catch(() => null)
            if (!target) return resolveKey(ctx, 'misc:giveawayNoMessage')

            const reaction = target.reactions.cache.get(record.emoji)
            if (!reaction) return resolveKey(ctx, 'misc:giveawayNoEntries')

            const users = new Map<string, User>()
            let after: string | undefined
            try {
                for (;;) {
                    const page = await reaction.users.fetch({ limit: 100, after })
                    for (const user of page.values()) users.set(user.id, user)
                    if (page.size < 100) break
                    after = page.last()!.id
                }
            } catch (error) {
                // Partial results would draw from whoever happened to fit in the pages
                // that came back, so the draw is abandoned. Log it: otherwise a failed
                // fetch is indistinguishable from a giveaway nobody entered.
                this.container.logger.warn('[giveaway] could not read entrants', error)
                users.clear()
            }
            const entrants = [...users.values()].filter((u) => !u.bot)
            if (!entrants.length) return resolveKey(ctx, 'misc:giveawayNoEntries')

            winnerId = entrants[Math.floor(Math.random() * entrants.length)].id
        }

        // Consume the exact draw before announcing it. Concurrent end commands
        // must not announce different winners or delete a newly started giveaway.
        const claimed = await sessionSchema.findOneAndDelete({
            key: this.recordKey(ctx),
            'data.messageId': record.messageId,
            'data.winnerId': record.winnerId ?? { $exists: false },
            expiresAt: { $gt: new Date() },
        })
        if (!claimed) return resolveKey(ctx, 'misc:giveawayNoMessage')
        try {
            await channel.send({
                content: await resolveKey(ctx, 'misc:giveawayWinner', { user: `<@${winnerId}>` }),
                nonce: record.messageId,
                enforceNonce: true,
            })
        } catch (error) {
            // Restore only if a new giveaway has not taken this channel's slot.
            // Retain the winner so a retry cannot draw a different person.
            await sessionSchema.updateOne({ key: claimed.key }, {
                $setOnInsert: {
                    key: claimed.key,
                    data: { ...record, winnerId },
                    expiresAt: claimed.expiresAt,
                },
            }, { upsert: true })
            throw error
        }
        return resolveKey(ctx, 'misc:giveawayEnded')
    }

    /**
     * The newest message that isn't the invocation itself — for a prefix command
     * the user's own `poi giveaway ...` would otherwise be the target.
     */
    private async latestMessage(ctx: Message | ChatInputCommandInteraction, channel: SendableChannels) {
        const fetched = await channel.messages.fetch({ limit: 5 }).catch(() => null)
        if (!fetched) return null
        const invocationId = ctx instanceof Message ? ctx.id : null
        return fetched.find((m) => m.id !== invocationId) ?? null
    }

    private recordKey(ctx: Message | ChatInputCommandInteraction) {
        return `giveaway:${ctx.guildId}:${ctx.channelId}`
    }
}
