import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { MessageFlags, ModalSubmitInteraction } from 'discord.js'
import { ComponentId, decodeId } from '../lib/util/component-id.js'
import { v2Update } from '../lib/util/v2.js'
import { getWaifus } from '../lib/functions/waifu.js'
import { wrapPage } from '../lib/waifu/picker.js'
import { renderSellPage, WAIFU_SELL_CMD } from '../commands/Waifu/sell.js'
import { renderWaifusPage, WAIFUS_PAGE_CMD } from '../commands/Waifu/waifus.js'

/**
 * "Jump to..." modal submissions for the collection screens.
 *
 * Modal submits are their own interaction type, so they can't be folded into the
 * button/menu handlers — but they share the same `cmd:owner:action:arg` ids, and
 * the `cmd` tells us which screen to re-render.
 */
export class WaifuJumpHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.ModalSubmit })
    }

    public override parse(interaction: ModalSubmitInteraction) {
        const id = decodeId(interaction.customId)
        if (!id || id.action !== 'jumpto') return this.none()
        if (id.cmd !== WAIFU_SELL_CMD && id.cmd !== WAIFUS_PAGE_CMD) return this.none()
        return this.some(id)
    }

    public override async run(interaction: ModalSubmitInteraction, id: ComponentId) {
        // Only a modal opened *from a message* can edit that message back.
        if (!interaction.isFromMessage()) return
        if (interaction.user.id !== id.owner) {
            await interaction.reply({ content: await resolveKey(interaction, 'common:notYourMenu'), flags: MessageFlags.Ephemeral })
            return
        }

        const raw = Number(interaction.fields.getTextInputValue('value').trim())
        const [current, tag] = (id.arg ?? '0').split('.')

        if (id.cmd === WAIFU_SELL_CMD) {
            const list = await getWaifus(interaction.guild!.id, id.owner)
            // Junk input just returns to the page they came from.
            const target = Number.isFinite(raw) ? wrapPage(raw - 1, list.length) : Number(current) || 0
            await interaction.update(v2Update(await renderSellPage(interaction, id.owner, target)))
            return
        }

        // Collection browser: one card per page, and `tag` is whose collection.
        const ownerId = tag || id.owner
        const list = await getWaifus(interaction.guild!.id, ownerId)
        const index = Number.isFinite(raw)
            ? Math.min(Math.max(0, raw - 1), Math.max(0, list.length - 1))
            : Number(current) || 0
        const shown = await interaction.client.users.fetch(ownerId).catch(() => null)
        await interaction.update(
            v2Update(
                await renderWaifusPage(interaction, id.owner, shown ?? { id: ownerId, username: ownerId }, index)
            )
        )
    }
}
