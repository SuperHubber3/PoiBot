import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import {
    ActionRowBuilder,
    ButtonInteraction,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js'
import { ComponentId, encodeId, isOwner, matchId } from '../lib/util/component-id.js'
import { v2Update } from '../lib/util/v2.js'
import { buyVip, buyWish, MAX_WISH_PURCHASE, renderShop, SHOP_CMD } from '../commands/Economy/shop.js'
import { WISH_COST } from '../lib/economy/prices.js'

export class ShopHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.Button })
    }

    public override parse(interaction: ButtonInteraction) {
        const id = matchId(interaction, SHOP_CMD)
        if (!id) return this.none()
        return this.some(id)
    }

    public override async run(interaction: ButtonInteraction, id: ComponentId) {
        if (!isOwner(interaction, id)) {
            await interaction.reply({
                content: await resolveKey(interaction, 'common:notYourMenu'),
                flags: MessageFlags.Ephemeral,
            })
            return
        }
        if (id.action !== 'buy') {
            await interaction.deferUpdate().catch(() => {})
            return
        }

        const guildId = interaction.guild!.id

        // Wishes are bought in bulk, so ask how many before charging anything.
        if (id.arg === 'wish') {
            await interaction.showModal(
                new ModalBuilder()
                    .setCustomId(encodeId({ cmd: SHOP_CMD, owner: id.owner, action: 'wishqty' }))
                    .setTitle((await resolveKey(interaction, 'common:shopWishModalTitle')).slice(0, 45))
                    .addComponents(
                        new ActionRowBuilder<TextInputBuilder>().addComponents(
                            new TextInputBuilder()
                                .setCustomId('amount')
                                .setLabel(
                                    (
                                        await resolveKey(interaction, 'common:shopWishModalLabel', {
                                            cost: WISH_COST,
                                            max: MAX_WISH_PURCHASE,
                                        })
                                    ).slice(0, 45)
                                )
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                                .setValue('1')
                                .setMaxLength(3)
                        )
                    )
            )
            return
        }

        if (id.arg !== 'vip') {
            await interaction.deferUpdate().catch(() => {})
            return
        }
        const note = await buyVip(interaction, guildId, id.owner)
        await interaction.update(v2Update(await renderShop(interaction, guildId, id.owner, note)))
    }
}
