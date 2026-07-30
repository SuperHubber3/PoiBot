import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ButtonInteraction, MessageFlags } from 'discord.js'
import { ComponentId, isOwner, matchId } from '../lib/util/component-id.js'
import { sessions } from '../lib/util/session-store.js'
import { v2Container, v2Update } from '../lib/util/v2.js'
import { spendSilver } from '../lib/functions/economy.js'
import {
    BLACKJACK_CMD,
    BlackjackSession,
    blackjackHandValue,
    drawBlackjackCard,
    renderBlackjack,
    settleBlackjack,
} from '../commands/Games/blackjack.js'

export class BlackjackHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.Button })
    }

    public override parse(interaction: ButtonInteraction) {
        const id = matchId(interaction, BLACKJACK_CMD)
        if (!id) return this.none()
        return this.some(id)
    }

    public override async run(interaction: ButtonInteraction, id: ComponentId) {
        if (!isOwner(interaction, id)) {
            await interaction.reply({ content: await resolveKey(interaction, 'common:notYourMenu'), flags: MessageFlags.Ephemeral })
            return
        }

        const current = await sessions.get<BlackjackSession>(interaction.message.id)
        if (!current) {
            await interaction.update(v2Update(v2Container(await resolveKey(interaction, 'common:menuExpired'))))
            return
        }
        const session = await sessions.acquire<BlackjackSession>(interaction.message.id)
        if (!session) {
            await interaction.deferUpdate().catch(() => {})
            return
        }

        if (id.action === 'double') {
            // Double the stake, take exactly one card, then stand — no further
            // action either way, which is what makes it a gamble.
            const guildId = interaction.guild!.id
            if (session.doubled || session.player.length !== 2) {
                await sessions.patch<BlackjackSession>(interaction.message.id, { busy: false })
                await interaction.deferUpdate().catch(() => {})
                return
            }
            if ((await spendSilver(guildId, id.owner, session.bet)) === null) {
                await sessions.patch<BlackjackSession>(interaction.message.id, { busy: false })
                await interaction.reply({
                    content: await resolveKey(interaction, 'games:blackjack.notEnoughToDouble'),
                    flags: MessageFlags.Ephemeral,
                })
                return
            }
            session.bet *= 2
            session.doubled = true
            session.player.push(drawBlackjackCard())
        } else if (id.action === 'hit') {
            session.player.push(drawBlackjackCard())
            if (blackjackHandValue(session.player) < 21) {
                await sessions.create<BlackjackSession>(
                    interaction.message.id,
                    { ...session, busy: false },
                    { persist: true }
                )
                // Doubling is an opening-hand-only move; after a hit it's gone.
                await interaction.update(v2Update(await renderBlackjack(interaction, id.owner, session, false)))
                return
            }
        }

        const claimed = await sessions.take<BlackjackSession>(interaction.message.id)
        if (!claimed) {
            await interaction.deferUpdate().catch(() => {})
            return
        }
        const container = await settleBlackjack(interaction, interaction.guild!.id, id.owner, id.owner, session)
        await interaction.update(v2Update(container))
    }
}
