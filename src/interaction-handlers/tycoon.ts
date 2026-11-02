import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ButtonInteraction, MessageFlags } from 'discord.js'
import { ComponentId, isOwner, matchId } from '../lib/util/component-id.js'
import { applyTycoonAction, renderTycoon, TYCOON_CMD } from '../lib/games/tycoon-ui.js'
import { v2Update } from '../lib/util/v2.js'

// Handles all tycoon panel buttons. Persistent (no collector) so the panel never
// times out; every click is acknowledged via interaction.update (works ephemeral).
export class TycoonHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.Button })
    }

    public override parse(interaction: ButtonInteraction) {
        const id = matchId(interaction, TYCOON_CMD)
        if (!id) return this.none()
        return this.some(id)
    }

    public override async run(interaction: ButtonInteraction, id: ComponentId) {
        if (!isOwner(interaction, id)) {
            await interaction.reply({ content: await resolveKey(interaction, 'common:notYourMenu'), flags: MessageFlags.Ephemeral })
            return
        }
        await interaction.deferUpdate()
        const guildId = interaction.guild!.id
        const { view, note } = await applyTycoonAction(interaction, guildId, id.owner, id.action, id.arg)
        const container = await renderTycoon(interaction, guildId, id.owner, id.owner, view, note)
        await interaction.editReply(v2Update(container))
    }
}
