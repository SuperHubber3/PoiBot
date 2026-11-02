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

        await interaction.deferUpdate()
        const session = await sessions.acquire<TradeSession>(interaction.message.id)
        if (!session) {
            if (await sessions.get(interaction.message.id)) return
            await interaction.editReply(v2Update(v2Container(await resolveKey(interaction, 'common:menuExpired'))))
            return
        }

        try {
            const picking = session.stage === 'mine' || session.stage === 'theirs'
            const expectedUser = picking ? session.initiatorId : session.partnerId
            if (interaction.user.id !== expectedUser) return
            if (picking && id.action !== 'page' && id.action !== 'pick') return
            if (!picking && id.action !== 'accept' && id.action !== 'decline') return

            // --- guided picker stages (session survives; only the offer consumes it) ---
            if (id.action === 'page') {
                const parsed = Number(id.arg?.split('.')[0] ?? 0)
                const page = Number.isNaN(parsed) ? 0 : parsed
                await interaction.editReply(v2Update(await renderTradePicker(interaction, session, page)))
                return
            }

            if (id.action === 'pick' && interaction.isStringSelectMenu()) {
                const guildId = interaction.guild!.id
                const from = session.stage === 'mine' ? session.initiatorId : session.partnerId
                const list = await getWaifus(guildId, from)
                const card = list.find((waifu) => waifu.uid === interaction.values[0])
                if (!card) {
                    await interaction.followUp({
                        content: await resolveKey(interaction, 'waifu:tradeFailed'),
                        flags: MessageFlags.Ephemeral,
                    })
                    return
                }

                if (session.stage === 'mine') {
                    session.myCard = card
                    // The command may already have named their card, in which case
                    // there is nothing left to pick.
                    session.stage = session.theirsFixed ? 'offer' : 'theirs'
                    await sessions.patch<TradeSession>(interaction.message.id, session)
                    const next =
                        session.stage === 'offer'
                            ? await renderTradeOffer(interaction, session)
                            : await renderTradePicker(interaction, session, 0)
                    await interaction.editReply(v2Update(next))
                    return
                }

                session.theirCard = card
                session.stage = 'offer'
                await sessions.patch<TradeSession>(interaction.message.id, session)
                await interaction.editReply(v2Update(await renderTradeOffer(interaction, session)))
                return
            }

            // Anything else that reaches here (a 'pick' that isn't a select menu, an
            // id from an older build) still has to be acknowledged, or the click dies
            // as "This interaction failed".
            if (id.action !== 'accept' && id.action !== 'decline') {
                return
            }

            // --- the offer itself: one shot ---
            // take() consumes the session atomically and hands it back only to the
            // winning caller. Deleting and carrying on would let a failed delete (or a
            // second click landing first) run the swap against a session that is still
            // reachable from another click or after a restart.
            const claimed = await sessions.take<TradeSession>(interaction.message.id)
            if (!claimed) {
                await interaction.editReply(v2Update(v2Container(await resolveKey(interaction, 'common:menuExpired'))))
                return
            }
            if (id.action === 'decline') {
                await interaction.editReply(v2Update(v2Container(await resolveKey(interaction, 'waifu:tradeDeclined'))))
                return
            }

            const guildId = interaction.guild!.id
            // All-or-nothing: if either card vanished since the offer was made the
            // swap is refused outright, so neither side gives something for nothing.
            const swapped = await swapCards(
                guildId,
                claimed.initiatorId,
                claimed.partnerId,
                claimed.myCard,
                claimed.theirCard
            )
            const key = swapped ? 'waifu:tradeComplete' : 'waifu:tradeFailed'
            await interaction.editReply(v2Update(v2Container(await resolveKey(interaction, key))))
        } finally {
            await sessions.patch<TradeSession>(interaction.message.id, { busy: false })
        }
    }
}
