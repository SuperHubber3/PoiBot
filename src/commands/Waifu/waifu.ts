import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    Message,
    MessageActionRowComponentBuilder,
    MessageComponentInteraction,
    SendableChannels,
} from 'discord.js'
import { MalCharacter, rollCharacter } from '../../lib/services/mal.service.js'
import { checkCooldown, refundCooldownUse } from '../../lib/functions/cooldown.js'
import { getSeenCharacterIds } from '../../lib/functions/waifu.js'
import { v2, v2Container, v2Payload } from '../../lib/util/v2.js'
import { encodeId } from '../../lib/util/component-id.js'
import { sessions } from '../../lib/util/session-store.js'
import {
    DEFAULT_PULL_LIMIT,
    initiatorProtected,
    PULL_KEY,
    renderWaifuPull,
    waifuPullActionRow,
    WaifuPullSession,
} from '../../lib/waifu/pull.js'
import { guildOnly } from '../../lib/util/install-context.js'

export {
    renderWaifuPull,
    waifuPullActionRow,
    WAIFU_PULL_CMD,
    SKIP_COST,
    type WaifuPullSession,
} from '../../lib/waifu/pull.js'

export const WAIFU_SUMMARY_CMD = 'wsum'

/** The most characters one `/waifu count:` may roll, as in the original. */
const MAX_COUNT = 20

export interface WaifuSummarySession {
    initiatorId: string
    busy?: boolean
    resolved?: boolean
    /** One entry per rolled card, tracking what became of it. */
    entries: {
        messageId: string
        name: string
        state: 'open' | 'claimed' | 'sold' | 'skipped' | 'unavailable'
    }[]
}

/** Summary panel for a multi-roll: running tally plus a Claim All button. */
export async function renderWaifuSummary(
    ctx: Message | ChatInputCommandInteraction | MessageComponentInteraction,
    session: WaifuSummarySession
) {
    const count = (state: string) => session.entries.filter((e) => e.state === state).length
    const open = count('open')

    const text = await resolveKey(ctx, 'waifu:summaryBody', {
        total: session.entries.length,
        claimed: count('claimed'),
        sold: count('sold'),
        skipped: count('skipped'),
        open,
    })
    const protectedPull = await initiatorProtected(ctx.guild!.id, session.initiatorId)
    const footer = await resolveKey(ctx, protectedPull ? 'waifu:pullProtected' : 'waifu:pullUnprotected')

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(encodeId({ cmd: WAIFU_SUMMARY_CMD, owner: session.initiatorId, action: 'claimall' }))
            .setLabel(await resolveKey(ctx, 'waifu:claimAllButton', { count: open }))
            .setEmoji('💖')
            .setStyle(ButtonStyle.Success)
            .setDisabled(open === 0)
    )

    return v2Container([`## ${await resolveKey(ctx, 'waifu:summaryTitle')}`, text, footer], { rows: [row] })
}

@ApplyOptions<Command.Options>({
    name: 'waifu',
    aliases: ['w'],
    description: 'Pull a random anime character',
    runIn: 'GUILD_ANY',
})
export class WaifuCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) =>
            guildOnly(b)
                .setName('waifu')
                .setDescription('Pull a random anime character')
                .addIntegerOption((opt) =>
                    opt
                        .setName('count')
                        .setDescription(`How many to roll (1-${MAX_COUNT})`)
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(MAX_COUNT)
                )
        )
    }

    public override async messageRun(message: Message, args: Args) {
        const count = await args.pick('integer').catch(() => 1)
        await this.pull(message, message.author.id, count)
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply()
        await this.pull(interaction, interaction.user.id, interaction.options.getInteger('count') ?? 1)
    }

    private async pull(ctx: Message | ChatInputCommandInteraction, userId: string, rawCount: number) {
        const guildId = ctx.guild!.id
        const send = (payload: any) => (ctx instanceof Message ? ctx.reply(payload) : ctx.editReply(payload))
        const count = Math.min(Math.max(1, rawCount || 1), MAX_COUNT)

        // Validate the whole batch against remaining pulls up front, so you're told
        // "you can only roll 3 more" rather than getting 3 cards and then an error.
        const budget = await checkCooldown(guildId, userId, PULL_KEY, DEFAULT_PULL_LIMIT, false)
        const remaining = (budget.limit ?? DEFAULT_PULL_LIMIT) - (budget.currentCount ?? 0)
        if (remaining <= 0) {
            return void await send(v2(await resolveKey(ctx, 'waifu:noPulls', {
                limit: budget.limit ?? DEFAULT_PULL_LIMIT,
            })))
        }
        if (count > remaining) {
            return void await send(
                v2(
                    await resolveKey(ctx, 'waifu:tooManyPulls', {
                        remaining,
                        used: budget.currentCount ?? 0,
                        limit: budget.limit ?? DEFAULT_PULL_LIMIT,
                    })
                )
            )
        }

        // Never roll a character they already own or skipped. The set grows as we
        // go, so a batch can't contain duplicates of itself either.
        const seen = await getSeenCharacterIds(guildId, userId)
        const characters: MalCharacter[] = []
        const pendingWindows: Date[] = []
        try {
            for (let i = 0; i < count; i++) {
                const spent = await checkCooldown(guildId, userId, PULL_KEY, DEFAULT_PULL_LIMIT, true)
                if (!spent.allowed) break
                pendingWindows.push(spent.windowStart)
                const character = await rollCharacter(seen)
                if (!character) break
                seen.add(character.id)
                characters.push(character)
            }

            if (!characters.length) {
                return void await send(v2(await resolveKey(ctx, 'waifu:genericError')))
            }
            const protectedPull = await initiatorProtected(guildId, userId)
            if (characters.length === 1) {
                const character = characters[0]
                const row = await waifuPullActionRow(ctx, userId, character)
                const container = await renderWaifuPull(ctx, character, row, undefined, protectedPull)
                const msg = (await send(v2Payload(container))) as Message
                await sessions.create<WaifuPullSession>(msg.id, { character, initiatorId: userId }, { persist: true })
                pendingWindows.shift()
                return
            }
            await this.multiRoll(ctx, userId, characters, protectedPull, send, pendingWindows)
        } finally {
            for (const consumedWindow of pendingWindows) {
                await refundCooldownUse(guildId, userId, PULL_KEY, consumedWindow).catch((error) => {
                    this.container.logger.error('[waifu] failed to refund undelivered pull', error)
                })
            }
        }
    }

    /**
     * One message per character, each independently claimable, plus a summary that
     * tracks the batch and offers Claim All — the shape the original used.
     */
    private async multiRoll(
        ctx: Message | ChatInputCommandInteraction,
        userId: string,
        characters: MalCharacter[],
        protectedPull: boolean,
        send: (payload: any) => Promise<unknown>,
        pendingWindows: Date[]
    ) {
        const channel = ctx.channel
        if (!channel?.isSendable()) {
            await send(v2(await resolveKey(ctx, 'waifu:genericError')))
            return
        }
        const entries: WaifuSummarySession['entries'] = []

        for (const [index, character] of characters.entries()) {
            const row = await waifuPullActionRow(ctx, userId, character)
            const container = await renderWaifuPull(ctx, character, row, undefined, protectedPull)
            let msg: Message
            try {
                msg = await channel.send(v2Payload(container))
            } catch (error) {
                this.container.logger.warn('[waifu] could not post batch card', error)
                break
            }
            // Register the session before posting the next card. Its buttons are
            // live the instant the message lands, and a batch of 20 takes seconds
            // to post — claiming card 1 during that window used to find no session
            // and close the card as "expired", losing the character.
            await sessions.create<WaifuPullSession>(
                msg.id,
                { character, initiatorId: userId, index },
                { persist: true }
            )
            pendingWindows.shift()
            entries.push({ messageId: msg.id, name: character.name, state: 'open' })
        }

        if (!entries.length) {
            await send(v2(await resolveKey(ctx, 'waifu:genericError')))
            return
        }
        const summarySession: WaifuSummarySession = { initiatorId: userId, entries }
        const summary = (await send(v2Payload(await renderWaifuSummary(ctx, summarySession)))) as Message
        await sessions.create<WaifuSummarySession>(summary.id, summarySession, { persist: true })

        // Each card knows its summary, so any action can refresh the tally. Linked
        // afterwards because the summary id doesn't exist until it is posted; a
        // card resolved before this lands simply doesn't refresh the tally, and
        // Claim All reconciles it as "unavailable".
        for (const entry of entries) {
            await sessions.patch<WaifuPullSession>(entry.messageId, { summaryId: summary.id })
        }
    }
}
