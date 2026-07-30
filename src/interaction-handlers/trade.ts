import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { AnySelectMenuInteraction, ButtonInteraction, MessageFlags } from 'discord.js'
import { ComponentId, isOwner, matchId } from '../lib/util/component-id.js'
import { sessions } from '../lib/util/session-store.js'
import { getWaifus } from '../lib/functions/waifu.js'
import { v2Container, v2Update } from '../lib/util/v2.js'
import {
    renderTradeOffer,
    renderTradePicker,
    swapCards,
    TRADE_CMD,
    TradeSession,
} from '../commands/Waifu/trade.js'

type TradeInteraction = ButtonInteraction | AnySelectMenuInteraction

export class TradeHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        // Covers both the Accept/Decline buttons and the guided picker's menu/pager.
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.MessageComponent })
    }

    public override parse(interaction: TradeInteraction) {
        const id = matchId(interaction, TRADE_CMD)
        if (!id) return this.none()
        return this.some(id)
    }

    public override async run(interaction: TradeInteraction, id: ComponentId) {
        if (!isOwner(interaction, id)) {
            await interaction.reply({ content: await resolveKey(interaction, 'common:notYourMenu'), flags: MessageFlags.Ephemeral })
            return
        }

        const session = await sessions.get<TradeSession>(interaction.message.id)
        if (!session) {
            await interaction.update(v2Update(v2Container(await resolveKey(interaction, 'common:menuExpired'))))
            return
        }

        // --- guided picker stages (session survives; only the offer consumes it) ---
        if (id.action === 'page') {
            const page = Number(id.arg?.split('.')[0] ?? 0)
            await interaction.update(v2Update(await renderTradePicker(interaction, session, page)))
            return
        }

        if (id.action === 'pick' && interaction.isStringSelectMenu()) {
            const guildId = interaction.guild!.id
            const from = session.stage === 'mine' ? session.initiatorId : session.partnerId
            const list = await getWaifus(guildId, from)
            const card = list.find((waifu) => waifu.uid === interaction.values[0])
            if (!card) {
                await interaction.reply({
                    content: await resolveKey(interaction, 'waifu:tradeFailed'),
                    flags: MessageFlags.Ephemeral,
                })
                return
            }

            if (session.stage === 'mine') {
                session.myCard = card
                session.stage = 'theirs'
                await sessions.create(interaction.message.id, session, { persist: true })
                await interaction.update(v2Update(await renderTradePicker(interaction, session, 0)))
                return
            }

            session.theirCard = card
            session.stage = 'offer'
            await sessions.create(interaction.message.id, session, { persist: true })
            await interaction.update(v2Update(await renderTradeOffer(interaction, session)))
            return
        }

        if (id.action !== 'accept' && id.action !== 'decline') return

        // --- the offer itself: one shot, so the session goes now ---
        await sessions.delete(interaction.message.id)
        if (id.action === 'decline') {
            await interaction.update(v2Update(v2Container(await resolveKey(interaction, 'waifu:tradeDeclined'))))
            return
        }

        const guildId = interaction.guild!.id
        // All-or-nothing: if either card vanished since the offer was made the
        // swap is refused outright, so neither side gives something for nothing.
        const swapped = await swapCards(
            guildId,
            session.initiatorId,
            session.partnerId,
            session.myCard,
            session.theirCard
        )
        const key = swapped ? 'waifu:tradeComplete' : 'waifu:tradeFailed'
        await interaction.update(v2Update(v2Container(await resolveKey(interaction, key))))
    }
}
