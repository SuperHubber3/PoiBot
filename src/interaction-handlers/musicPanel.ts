import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ButtonInteraction, GuildMember, MessageFlags } from 'discord.js'
import { ComponentId, matchId } from '../lib/util/component-id.js'
import { buildPanel, PANEL_CMD } from '../lib/music/panel.js'
import { getQueue } from '../lib/music/queue.js'

/**
 * Now Playing panel buttons.
 *
 * Unlike most panels these are shared controls, so anyone listening in the same
 * voice channel may use them — not just the person who queued the track.
 */
export class MusicPanelHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.Button })
    }

    public override parse(interaction: ButtonInteraction) {
        const id = matchId(interaction, PANEL_CMD)
        if (!id) return this.none()
        return this.some(id)
    }

    public override async run(interaction: ButtonInteraction, id: ComponentId) {
        if (id.action === 'dashboard') {
            await interaction.reply({
                content: await resolveKey(interaction, 'common:musicDashboardSoon'),
                flags: MessageFlags.Ephemeral,
            })
            return
        }

        const queue = getQueue(interaction.guild!.id)
        if (!queue || !queue.current) {
            await interaction.reply({
                content: await resolveKey(interaction, 'common:musicNothingPlaying'),
                flags: MessageFlags.Ephemeral,
            })
            return
        }

        // Controls are limited to people actually in the bot's voice channel.
        const member = interaction.member as GuildMember | null
        const botChannelId = interaction.guild!.members.me?.voice.channelId
        if (!botChannelId || member?.voice.channelId !== botChannelId) {
            await interaction.reply({
                content: await resolveKey(interaction, 'common:musicNoVoice'),
                flags: MessageFlags.Ephemeral,
            })
            return
        }

        switch (id.action) {
            case 'playpause':
                await queue.player.setPaused(!queue.player.paused)
                break
            case 'skip':
                await queue.skip()
                break
            case 'stop':
                await interaction.deferUpdate().catch(() => {})
                await queue.destroy()
                return
            case 'autoplay':
                queue.autoplay = !queue.autoplay
                break
            default:
                break
        }

        // update() acks and re-renders in one call, so the panel never "fails".
        await interaction.update({ components: [buildPanel(queue, id.owner)] as any }).catch(() => {})
    }
}
