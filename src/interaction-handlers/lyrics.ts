import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ButtonInteraction, MessageFlags } from 'discord.js'
import { LYRICS_CMD, LyricsSession, renderLyricsPage } from '../commands/Music/lyrics.js'
import { ComponentId, isOwner, matchId } from '../lib/util/component-id.js'
import { sessions } from '../lib/util/session-store.js'
import { v2Container, v2Update } from '../lib/util/v2.js'

export class LyricsHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.Button })
    }

    public override parse(interaction: ButtonInteraction) {
        const id = matchId(interaction, LYRICS_CMD)
        if (!id) return this.none()
        return this.some(id)
    }

    public override async run(interaction: ButtonInteraction, id: ComponentId) {
        if (!isOwner(interaction, id)) {
            await interaction.reply({ content: await resolveKey(interaction, 'common:notYourMenu'), flags: MessageFlags.Ephemeral })
            return
        }

        const session = await sessions.get<LyricsSession>(interaction.message.id)
        if (!session) {
            await interaction.update(v2Update(v2Container(await resolveKey(interaction, 'common:menuExpired'))))
            return
        }

        const parsed = id.action === 'page' ? Number(id.arg ?? 0) : 0
        const page = Number.isNaN(parsed) ? 0 : parsed
        await interaction.update(v2Update(await renderLyricsPage(interaction, id.owner, session, page)))
    }
}
