import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ButtonInteraction,
    ChatInputCommandInteraction,
    ContainerBuilder,
    Message,
    MessageActionRowComponentBuilder,
    User,
} from 'discord.js'
import { BLACKJACK_MAX_BET } from '../../lib/economy/prices.js'
import { addSilver, getSilver, spendSilver } from '../../lib/functions/economy.js'
import { encodeId } from '../../lib/util/component-id.js'
import { sessions } from '../../lib/util/session-store.js'
import { v2, v2Container, v2Payload, v2Update } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

export const BLACKJACK_CMD = 'bj'

const SUITS = ['♠', '♥', '♦', '♣']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

export type Card = { rank: string; suit: string }
export interface BlackjackSession {
    player: Card[]
    dealer: Card[]
    bet: number
    clampNotice?: string
    /** Set once the bet has been doubled, so it can't be doubled twice. */
    doubled?: boolean
    busy?: boolean
    resolved?: boolean
}
type BlackjackCtx = Message | ChatInputCommandInteraction | ButtonInteraction
type BlackjackOutcome = 'win' | 'push' | 'lose'

export const drawBlackjackCard = (): Card => ({
    rank: RANKS[Math.floor(Math.random() * RANKS.length)],
    suit: SUITS[Math.floor(Math.random() * SUITS.length)],
})

export function blackjackHandValue(cards: Card[]): number {
    let total = 0
    let aces = 0
    for (const c of cards) {
        if (c.rank === 'A') {
            aces++
            total += 11
        } else if (['J', 'Q', 'K'].includes(c.rank)) total += 10
        else total += parseInt(c.rank, 10)
    }
    while (total > 21 && aces > 0) {
        total -= 10
        aces--
    }
    return total
}

const show = (cards: Card[]) => cards.map((c) => `${c.rank}${c.suit}`).join(' ')

export async function renderBlackjack(
    ctx: BlackjackCtx,
    owner: string,
    session: BlackjackSession,
    done: boolean,
    result?: string,
    outcome: BlackjackOutcome = 'lose',
    canDouble = false,
    interactive = true
): Promise<ContainerBuilder> {
    const dealerText = done
        ? `${show(session.dealer)} (${blackjackHandValue(session.dealer)})`
        : `${session.dealer[0].rank}${session.dealer[0].suit} ?`
    const text = await resolveKey(ctx, 'games:blackjack.board', {
        player: show(session.player),
        playerValue: blackjackHandValue(session.player),
        dealer: dealerText,
        result: result ? `\n\n${result}` : '',
    })
    const color = done ? (outcome === 'win' ? 0x2ecc71 : outcome === 'push' ? 0x95a5a6 : 0xe74c3c) : 0x5865f2
    return v2Container(text, {
        color,
        rows: done || !interactive ? [] : [await blackjackRowAsync(ctx, owner, session, canDouble)],
    })
}

/**
 * Hit / Double / Stand — the three actions the original engine exposed.
 *
 * Double is only offered on the opening two cards (standard rule, and the only
 * point at which the old engine reported it as available) and only when the
 * player can actually cover the extra stake.
 */
async function blackjackRowAsync(ctx: BlackjackCtx, owner: string, session: BlackjackSession, canDouble: boolean) {
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(encodeId({ cmd: BLACKJACK_CMD, owner, action: 'hit' }))
            .setLabel(await resolveKey(ctx, 'games:blackjack.hit'))
            .setStyle(ButtonStyle.Primary)
    )
    if (session.player.length === 2 && canDouble) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(encodeId({ cmd: BLACKJACK_CMD, owner, action: 'double' }))
                .setLabel(await resolveKey(ctx, 'games:blackjack.double', { amount: session.bet }))
                .setStyle(ButtonStyle.Success)
        )
    }
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(encodeId({ cmd: BLACKJACK_CMD, owner, action: 'stand' }))
            .setLabel(await resolveKey(ctx, 'games:blackjack.stand'))
            .setStyle(ButtonStyle.Secondary)
    )
    return row
}

export async function settleBlackjack(
    ctx: BlackjackCtx,
    guildId: string,
    userId: string,
    owner: string,
    session: BlackjackSession
): Promise<ContainerBuilder> {
    const pv = blackjackHandValue(session.player)
    while (blackjackHandValue(session.dealer) < 17) session.dealer.push(drawBlackjackCard())
    const dv = blackjackHandValue(session.dealer)

    let delta = 0
    let payout = 0
    let resultKey: string
    let outcome: BlackjackOutcome = 'lose'
    if (pv > 21) {
        delta = -session.bet
        resultKey = 'games:blackjack.resultBust'
    } else if (pv === 21 && session.player.length === 2) {
        if (dv === 21 && session.dealer.length === 2) {
            delta = 0
            payout = session.bet
            resultKey = 'games:blackjack.resultPush'
            outcome = 'push'
        } else {
            delta = session.bet
            payout = session.bet * 2
            resultKey = 'games:blackjack.resultBlackjack'
            outcome = 'win'
        }
    } else if (dv > 21 || pv > dv) {
        delta = session.bet
        payout = session.bet * 2
        resultKey = 'games:blackjack.resultWin'
        outcome = 'win'
    } else if (pv === dv && !(dv === 21 && session.dealer.length === 2)) {
        delta = 0
        payout = session.bet
        resultKey = 'games:blackjack.resultPush'
        outcome = 'push'
    } else {
        delta = -session.bet
        resultKey = 'games:blackjack.resultLose'
    }

    if (payout > 0) await addSilver(guildId, userId, payout)
    const result = await resolveKey(ctx, resultKey, { amount: Math.abs(delta) })
    const resultWithNotice = [session.clampNotice, result].filter(Boolean).join('\n')
    return renderBlackjack(ctx, owner, session, true, resultWithNotice, outcome)
}

@ApplyOptions<Command.Options>({
    name: 'blackjack',
    aliases: ['bj'],
    description: 'Play blackjack against the dealer, betting silver',
    runIn: 'GUILD_ANY',
    cooldownDelay: 5000,
})
export class BlackjackCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('blackjack')
                .setDescription('Play blackjack against the dealer, betting silver')
                .addIntegerOption((opt) => opt.setName('bet').setDescription('Silver to bet').setRequired(true).setMinValue(1))
        )
    }

    public override async messageRun(message: Message, args: Args) {
        const bet = await args.pick('integer').catch(() => NaN)
        await this.play(message, message.author, bet)
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await this.play(interaction, interaction.user, interaction.options.getInteger('bet', true))
    }

    private async play(ctx: Message | ChatInputCommandInteraction, user: User, bet: number) {
        const guildId = ctx.guild!.id

        if (isNaN(bet) || bet <= 0) {
            await this.reply(ctx, v2(await resolveKey(ctx, 'games:blackjack.invalidBet')))
            return
        }
        const wasClamped = bet > BLACKJACK_MAX_BET
        bet = Math.min(bet, BLACKJACK_MAX_BET)
        const balance = await getSilver(guildId, user.id)
        if (balance < bet) {
            await this.reply(ctx, v2(await resolveKey(ctx, 'games:blackjack.notEnoughSilver')))
            return
        }
        const remaining = await spendSilver(guildId, user.id, bet)
        if (remaining === null) {
            await this.reply(ctx, v2(await resolveKey(ctx, 'games:blackjack.notEnoughSilver')))
            return
        }

        const clampNotice = wasClamped
            ? await resolveKey(ctx, 'games:blackjack.betClamped', { amount: BLACKJACK_MAX_BET })
            : undefined
        const session: BlackjackSession = {
            player: [drawBlackjackCard(), drawBlackjackCard()],
            dealer: [drawBlackjackCard(), drawBlackjackCard()],
            bet,
            clampNotice,
        }

        // Doubling costs a second stake, so only offer it if they can pay it.
        const canDouble = remaining >= bet
        let sessionId: string | null = null
        let settling = false
        try {
            const sent = await this.reply(
                ctx,
                v2Payload(await renderBlackjack(ctx, user.id, session, false, clampNotice, 'lose', canDouble, false))
            )
            await sessions.create<BlackjackSession>(sent.id, session, { persist: true })
            sessionId = sent.id

            if (blackjackHandValue(session.player) === 21) {
                const claimed = await sessions.take<BlackjackSession>(sent.id)
                if (!claimed) return
                settling = true
                const container = await settleBlackjack(ctx, guildId, user.id, user.id, claimed)
                await sent.edit(v2Update(container)).catch(() => {})
                return
            }
            await sent.edit(
                v2Update(await renderBlackjack(ctx, user.id, session, false, clampNotice, 'lose', canDouble))
            )
        } catch (error) {
            // Claim the hand before handing the stake back. The session is already
            // persisted and playable at this point, so refunding on its own would
            // let the button handler settle and pay out on a bet that was returned.
            if (settling) throw error
            if (sessionId && !(await sessions.take<BlackjackSession>(sessionId))) throw error
            await addSilver(guildId, user.id, bet)
            throw error
        }
    }

    private async reply(ctx: Message | ChatInputCommandInteraction, payload: any): Promise<Message> {
        if (ctx instanceof Message) return ctx.reply(payload)
        await ctx.reply(payload)
        return ctx.fetchReply()
    }
}
