import { ApplyOptions } from '@sapphire/decorators'
import { Command, container } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import mongoose from 'mongoose'
import type { ClientSession } from 'mongoose'
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    MessageActionRowComponentBuilder,
    MessageComponentInteraction,
    ModalSubmitInteraction,
} from 'discord.js'
import waifuSchema from '../../lib/models/waifu-schema.js'
import { getWaifus, OwnedWaifu } from '../../lib/functions/waifu.js'
import { pickerRows } from '../../lib/waifu/picker.js'
import { v2, v2Container, v2Payload } from '../../lib/util/v2.js'
import { encodeId } from '../../lib/util/component-id.js'
import { sessions } from '../../lib/util/session-store.js'
import { guildOnly } from '../../lib/util/install-context.js'

export const TRADE_CMD = 'trade'

type TradeCtx = ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction

/**
 * `stage` drives the guided flow when the command is used without card numbers:
 *   mine   → initiator picks what to give
 *   theirs → initiator picks what to ask for
 *   offer  → waiting on the partner's Accept/Decline
 */
export type TradeStage = 'mine' | 'theirs' | 'offer'

export interface TradeSession {
    busy?: boolean
    initiatorId: string
    partnerId: string
    stage: TradeStage
    myCard?: OwnedWaifu
    theirCard?: OwnedWaifu
    /**
     * Set when the command already supplied `theirs`, so the picker asks only for
     * the side that is still missing and then goes straight to the offer.
     */
    theirsFixed?: boolean
}

/** Picker over one side's collection, used for the `mine` and `theirs` stages. */
export async function renderTradePicker(
    ctx: TradeCtx,
    session: TradeSession,
    page: number
) {
    const guildId = ctx.guild!.id
    const pickingOwn = session.stage === 'mine'
    const list = await getWaifus(guildId, pickingOwn ? session.initiatorId : session.partnerId)

    if (!list.length) {
        const key = pickingOwn ? 'waifu:tradeYouHaveNone' : 'waifu:tradePartnerHasNone'
        return v2Container(await resolveKey(ctx, key))
    }

    const rows = await pickerRows(ctx, {
        cmd: TRADE_CMD,
        // The initiator drives both picking stages.
        owner: session.initiatorId,
        list,
        page,
        placeholder: await resolveKey(ctx, pickingOwn ? 'waifu:tradePickYours' : 'waifu:tradePickTheirs'),
    })

    const prompt = await resolveKey(ctx, pickingOwn ? 'waifu:tradeStepGive' : 'waifu:tradeStepWant', {
        partner: `<@${session.partnerId}>`,
        card: session.myCard?.name ?? '',
    })
    return v2Container([`## ${await resolveKey(ctx, 'waifu:tradeTitle')}`, prompt], { rows })
}

/** The final Accept/Decline offer shown to the partner. */
export async function renderTradeOffer(ctx: TradeCtx, session: TradeSession) {
    const nothing = await resolveKey(ctx, 'waifu:nothing')
    const offer = await resolveKey(ctx, 'waifu:tradeOffer', {
        user: `<@${session.initiatorId}>`,
        partner: `<@${session.partnerId}>`,
        yours: session.myCard?.name ?? nothing,
        theirs: session.theirCard?.name ?? nothing,
    })
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(encodeId({ cmd: TRADE_CMD, owner: session.partnerId, action: 'accept' }))
            .setLabel(await resolveKey(ctx, 'waifu:acceptButton'))
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(encodeId({ cmd: TRADE_CMD, owner: session.partnerId, action: 'decline' }))
            .setLabel(await resolveKey(ctx, 'waifu:declineButton'))
            .setStyle(ButtonStyle.Danger)
    )
    return v2Container([`## ${await resolveKey(ctx, 'waifu:tradeTitle')}`, offer], { rows: [row] })
}

/**
 * Detaches a card from its owner, returning it if (and only if) they still had
 * it. Returns null when the card is gone — sold or traded away since the offer
 * was made — so the caller can abort instead of half-completing the trade.
 */
async function takeCard(
    guildId: string,
    fromId: string,
    card: OwnedWaifu | undefined,
    dbSession?: ClientSession
): Promise<OwnedWaifu | null | 'nothing'> {
    if (!card) return 'nothing'
    const match = {
        uid: card.uid,
        id: card.id,
        claimedAt: card.claimedAt,
        blacklisted: { $ne: true },
    }
    const fromDoc = await waifuSchema.findOneAndUpdate(
        { guildId, userId: fromId, waifus: { $elemMatch: match } },
        { $pull: { waifus: match } },
        { new: false, session: dbSession }
    )
    if (!fromDoc) return null
    const taken = (fromDoc.waifus as OwnedWaifu[]).find(
        (waifu) =>
            !waifu.blacklisted &&
            waifu.uid === card.uid &&
            waifu.id === card.id &&
            waifu.claimedAt === card.claimedAt
    )
    return taken ?? null
}

/** Gives a previously detached card to a user. */
async function giveCard(guildId: string, toId: string, card: OwnedWaifu, dbSession?: ClientSession) {
    await waifuSchema.updateOne(
        { guildId, userId: toId },
        { $setOnInsert: { guildId, userId: toId } },
        { upsert: true, session: dbSession }
    )
    // UID makes retries idempotent: recovery can safely call this again.
    await waifuSchema.updateOne(
        { guildId, userId: toId, 'waifus.uid': { $ne: card.uid } },
        { $push: { waifus: card } },
        { session: dbSession }
    )
}

class CardUnavailableError extends Error {}

async function transactionalSwap(
    guildId: string,
    initiatorId: string,
    partnerId: string,
    initiatorCard: OwnedWaifu | undefined,
    partnerCard: OwnedWaifu | undefined
): Promise<boolean> {
    const dbSession = await mongoose.startSession()
    try {
        await dbSession.withTransaction(async () => {
            const fromInitiator = await takeCard(guildId, initiatorId, initiatorCard, dbSession)
            if (fromInitiator === null) throw new CardUnavailableError()
            const fromPartner = await takeCard(guildId, partnerId, partnerCard, dbSession)
            if (fromPartner === null) throw new CardUnavailableError()
            if (fromInitiator !== 'nothing') await giveCard(guildId, partnerId, fromInitiator, dbSession)
            if (fromPartner !== 'nothing') await giveCard(guildId, initiatorId, fromPartner, dbSession)
        })
        return true
    } catch (error) {
        if (error instanceof CardUnavailableError) return false
        throw error
    } finally {
        await dbSession.endSession()
    }
}

function transactionUnsupported(error: unknown): boolean {
    const candidate = error as { code?: number; message?: string }
    return candidate?.code === 20 ||
        /Transaction numbers are only allowed on a replica set member or mongos/i.test(candidate?.message ?? '')
}

async function compensatedSwap(
    guildId: string,
    initiatorId: string,
    partnerId: string,
    initiatorCard: OwnedWaifu | undefined,
    partnerCard: OwnedWaifu | undefined
): Promise<boolean> {
    const restoreOriginals = async (
        first: OwnedWaifu | undefined,
        second: OwnedWaifu | undefined
    ) => {
        if (first) await giveCard(guildId, initiatorId, first)
        if (second) await giveCard(guildId, partnerId, second)
    }

    let fromInitiator: OwnedWaifu | null | 'nothing'
    try {
        fromInitiator = await takeCard(guildId, initiatorId, initiatorCard)
    } catch (error) {
        // The server may have applied the pull before the driver observed the
        // network failure. Idempotent giveCard makes this safe either way.
        await restoreOriginals(initiatorCard, undefined).catch((rollbackError) =>
            container.logger.error('[trade] failed to compensate initiator detach', rollbackError)
        )
        throw error
    }
    if (fromInitiator === null) return false

    let fromPartner: OwnedWaifu | null | 'nothing'
    try {
        fromPartner = await takeCard(guildId, partnerId, partnerCard)
    } catch (error) {
        await restoreOriginals(
            fromInitiator === 'nothing' ? undefined : fromInitiator,
            partnerCard
        ).catch((rollbackError) =>
            container.logger.error('[trade] failed to compensate partner detach', rollbackError)
        )
        throw error
    }
    if (fromPartner === null) {
        if (fromInitiator !== 'nothing') await giveCard(guildId, initiatorId, fromInitiator)
        return false
    }

    try {
        if (fromInitiator !== 'nothing') {
            await giveCard(guildId, partnerId, fromInitiator)
        }
        if (fromPartner !== 'nothing') {
            await giveCard(guildId, initiatorId, fromPartner)
        }
        return true
    } catch (error) {
        try {
            // A network error can arrive after MongoDB applied a write, so probe
            // both destinations rather than relying on local "gave" flags.
            if (fromInitiator !== 'nothing') await takeCard(guildId, partnerId, fromInitiator)
            if (fromPartner !== 'nothing') await takeCard(guildId, initiatorId, fromPartner)
            await restoreOriginals(
                fromInitiator === 'nothing' ? undefined : fromInitiator,
                fromPartner === 'nothing' ? undefined : fromPartner
            )
        } catch (rollbackError) {
            container.logger.error('[trade] failed to compensate a partial standalone swap', rollbackError)
        }
        throw error
    }
}

/**
 * Swaps two cards, all-or-nothing.
 *
 * Both cards are detached from their owners *before* either is handed over. If
 * the second detach fails (the card was sold between the offer and the accept),
 * the first is returned to its owner and the trade is refused — previously the
 * failing side silently no-opped and the other side handed their card over for
 * nothing.
 */
export async function swapCards(
    guildId: string,
    initiatorId: string,
    partnerId: string,
    initiatorCard: OwnedWaifu | undefined,
    partnerCard: OwnedWaifu | undefined
): Promise<boolean> {
    try {
        return await transactionalSwap(guildId, initiatorId, partnerId, initiatorCard, partnerCard)
    } catch (error) {
        if (!transactionUnsupported(error)) throw error
        container.logger.warn('[trade] MongoDB transactions unavailable; using compensated swap')
        return compensatedSwap(guildId, initiatorId, partnerId, initiatorCard, partnerCard)
    }
}

@ApplyOptions<Command.Options>({
    name: 'trade',
    description: 'Trade a character with another user',
    runIn: 'GUILD_ANY',
})
export class TradeCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('trade')
                .setDescription('Trade a character with another user')
                .addUserOption((opt) => opt.setName('user').setDescription('Trade partner').setRequired(true))
                // Optional: omit both and you get a guided picker instead of having
                // to look up card numbers in /waifus first.
                .addIntegerOption((opt) => opt.setName('yours').setDescription('Your character # (0 = give nothing)').setRequired(false).setMinValue(0))
                .addIntegerOption((opt) => opt.setName('theirs').setDescription('Their character # (0 = receive nothing)').setRequired(false).setMinValue(0))
        )
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const partner = interaction.options.getUser('user', true)
        const yours = interaction.options.getInteger('yours')
        const theirs = interaction.options.getInteger('theirs')
        const guildId = interaction.guild!.id
        const me = interaction.user

        if (partner.id === me.id || partner.bot) {
            await interaction.reply(v2(await resolveKey(interaction, 'waifu:tradeInvalidPartner'), { ephemeral: true }))
            return
        }

        const session: TradeSession = { initiatorId: me.id, partnerId: partner.id, stage: 'mine' }

        // Whichever numbers were given are honoured. Give both and you go straight
        // to the offer; give one and the picker opens on the other side rather than
        // silently throwing away what was typed.
        if (yours !== null) {
            const mine = await getWaifus(guildId, me.id)
            const myCard = yours > 0 ? mine[yours - 1] : undefined
            if (yours > 0 && !myCard) {
                return void interaction.reply(v2(await resolveKey(interaction, 'waifu:tradeInvalidYours'), { ephemeral: true }))
            }
            session.myCard = myCard
            session.stage = 'theirs'
        }
        if (theirs !== null) {
            const partnerCards = await getWaifus(guildId, partner.id)
            const theirCard = theirs > 0 ? partnerCards[theirs - 1] : undefined
            if (theirs > 0 && !theirCard) {
                return void interaction.reply(v2(await resolveKey(interaction, 'waifu:tradeInvalidTheirs'), { ephemeral: true }))
            }
            session.theirCard = theirCard
            session.theirsFixed = true
            session.stage = yours !== null ? 'offer' : 'mine'
        }

        const rendered =
            session.stage === 'offer'
                ? await renderTradeOffer(interaction, session)
                : await renderTradePicker(interaction, session, 0)

        await interaction.reply(v2Payload(rendered))
        const msg = await interaction.fetchReply()
        // Real assets at stake — the session must survive a restart.
        await sessions.create<TradeSession>(msg.id, session, { persist: true })
    }
}
