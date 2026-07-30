import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { MessageFlags, ModalSubmitInteraction } from 'discord.js'
import { ComponentId, decodeId } from '../lib/util/component-id.js'
import { v2Update } from '../lib/util/v2.js'
import { buyWish, renderShop, SHOP_CMD } from '../commands/Economy/shop.js'

/**
 * The "how many wishes?" modal.
 *
 * Lives in its own file because Sapphire loads exactly one piece per file — when
 * this shared shop.ts with the button handler, only one of the two was ever
 * registered and every shop button died with "Bot didn't respond in time".
 */
export class ShopModalHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.ModalSubmit })
    }

    public override parse(interaction: ModalSubmitInteraction) {
        const id = decodeId(interaction.customId)
        if (!id || id.cmd !== SHOP_CMD || id.action !== 'wishqty') return this.none()
        return this.some(id)
    }

    public override async run(interaction: ModalSubmitInteraction, id: ComponentId) {
        // Only a modal opened from a message can edit that message back.
        if (!interaction.isFromMessage()) return
        if (interaction.user.id !== id.owner) {
            await interaction.reply({
                content: await resolveKey(interaction, 'common:notYourMenu'),
                flags: MessageFlags.Ephemeral,
            })
            return
        }

        const guildId = interaction.guild!.id
        const amount = Number(interaction.fields.getTextInputValue('amount').trim())
        const note = await buyWish(interaction, guildId, id.owner, amount)
        await interaction.update(v2Update(await renderShop(interaction, guildId, id.owner, note)))
    }
}
