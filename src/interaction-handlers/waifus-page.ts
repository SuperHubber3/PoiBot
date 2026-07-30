import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ButtonInteraction, MessageFlags } from 'discord.js'
import { ComponentId, isOwner, matchId } from '../lib/util/component-id.js'
import { v2Update } from '../lib/util/v2.js'
import { countWaifus } from '../lib/functions/waifu.js'
import { jumpModal } from '../lib/waifu/picker.js'
import { renderWaifusPage, WAIFUS_PAGE_CMD } from '../commands/Waifu/waifus.js'

export class WaifusPageHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.Button })
    }

    public override parse(interaction: ButtonInteraction) {
        const id = matchId(interaction, WAIFUS_PAGE_CMD)
        if (!id) return this.none()
        return this.some(id)
    }

    public override async run(interaction: ButtonInteraction, id: ComponentId) {
        if (!isOwner(interaction, id)) {
            await interaction.reply({ content: await resolveKey(interaction, 'common:notYourMenu'), flags: MessageFlags.Ephemeral })
            return
        }

        // arg is `<index>.<collectionOwnerId>` — you can browse someone else's
        // collection, so the target user has to travel with the button.
        const [rawIndex, ownerId = id.owner] = (id.arg ?? '0').split('.')
        const parsed = Number(rawIndex)
        const index = Number.isFinite(parsed) ? parsed : 0

        if (id.action === 'jump') {
            // Count only: getWaifus resolves prices, which can hit MAL, and a
            // modal has to open inside the 3-second window.
            const total = await countWaifus(interaction.guild!.id, ownerId)
            await interaction.showModal(
                await jumpModal(interaction, WAIFUS_PAGE_CMD, id.owner, id.arg ?? '0', total, 'card')
            )
            return
        }

        const owner = await interaction.client.users.fetch(ownerId).catch(() => null)
        await interaction.update(
            v2Update(await renderWaifusPage(interaction, id.owner, owner ?? { id: ownerId, username: ownerId }, index))
        )
    }
}
