import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ButtonInteraction, MessageFlags } from 'discord.js'
import { ComponentId, isOwner, matchId } from '../lib/util/component-id.js'
import { v2Update } from '../lib/util/v2.js'
import type { GachaGame } from '../lib/gacha/gacha.js'
import { COLLECTION_CMD, renderCollection } from '../commands/Games/collection.js'

export class CollectionHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.Button })
    }

    public override parse(interaction: ButtonInteraction) {
        const id = matchId(interaction, COLLECTION_CMD)
        if (!id) return this.none()
        return this.some(id)
    }

    public override async run(interaction: ButtonInteraction, id: ComponentId) {
        if (id.action === 'noop') return
        if (!isOwner(interaction, id)) {
            await interaction.reply({
                content: await resolveKey(interaction, 'common:notYourMenu'),
                flags: MessageFlags.Ephemeral,
            })
            return
        }

        // arg is `<page>.<game>.<collectionOwnerId>`; `id.owner` is the viewer
        // allowed to operate the controls.
        const [rawPage, rawGame, collectionOwnerId = id.owner] =
            (id.arg ?? '0.genshin').split('.')
        const page = Number.isFinite(Number(rawPage)) ? Number(rawPage) : 0
        const game: GachaGame = rawGame === 'bluearchive' ? 'bluearchive' : 'genshin'

        const owner = await interaction.client.users.fetch(collectionOwnerId).catch(() => null)
        if (!owner) {
            await interaction.reply({
                content: await resolveKey(interaction, 'common:menuExpired'),
                flags: MessageFlags.Ephemeral,
            })
            return
        }
        await interaction.update(
            v2Update(
                await renderCollection(
                    interaction,
                    game,
                    interaction.guildId!,
                    id.owner,
                    owner,
                    page
                )
            )
        )
    }
}
