import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ButtonInteraction, MessageFlags } from 'discord.js'
import { ComponentId, isOwner, matchId } from '../lib/util/component-id.js'
import { v2Update } from '../lib/util/v2.js'
import { buyUpgrade, renderUpgrade, UPGRADE_CMD, UPGRADES, UpgradeType } from '../commands/Waifu/upgrade.js'

export class WaifuUpgradeHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.Button })
    }

    public override parse(interaction: ButtonInteraction) {
        const id = matchId(interaction, UPGRADE_CMD)
        if (!id) return this.none()
        return this.some(id)
    }

    public override async run(interaction: ButtonInteraction, id: ComponentId) {
        if (!isOwner(interaction, id)) {
            await interaction.reply({ content: await resolveKey(interaction, 'common:notYourMenu'), flags: MessageFlags.Ephemeral })
            return
        }
        if (id.action !== 'buy') {
            await interaction.deferUpdate().catch(() => {})
            return
        }

        if (!id.arg || !Object.hasOwn(UPGRADES, id.arg)) {
            await interaction.deferUpdate().catch(() => {})
            return
        }
        const type = id.arg as UpgradeType

        const guildId = interaction.guild!.id
        const note = await buyUpgrade(interaction, guildId, id.owner, type)
        // Re-render so the new level, the doubled price and the button's
        // affordability all update in place.
        await interaction.update(v2Update(await renderUpgrade(interaction, guildId, id.owner, note)))
    }
}
