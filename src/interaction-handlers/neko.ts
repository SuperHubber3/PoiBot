import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ButtonInteraction, MessageFlags } from 'discord.js'
import { NEKO_CMD } from '../commands/Anime/neko.js'
import { ComponentId, isOwner, matchId } from '../lib/util/component-id.js'

export class NekoHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.Button })
    }

    public override parse(interaction: ButtonInteraction) {
        const id = matchId(interaction, NEKO_CMD)
        if (!id) return this.none()
        return this.some(id)
    }

    public override async run(interaction: ButtonInteraction, id: ComponentId) {
        if (!isOwner(interaction, id)) {
            await interaction.reply({ content: await resolveKey(interaction, 'common:notYourMenu'), flags: MessageFlags.Ephemeral })
            return
        }

        if (id.action === 'delete') {
            try {
                await interaction.deferUpdate()
                await interaction.deleteReply()
            } catch (error) {
                this.container.logger.warn('[neko] failed to delete interaction response', error)
            }
        }
    }
}
