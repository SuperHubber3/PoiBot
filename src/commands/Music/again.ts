import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message, SendableChannels } from 'discord.js'
import { createQueue, DifferentVoiceChannelError, getLastPlayed } from '../../lib/music/queue.js'
import { showPanel } from '../../lib/music/panel.js'
import { awaitNode } from '../../lib/services/lavalink.service.js'
import { MusicCtx, voiceChannelOf } from '../../lib/util/music-ctx.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

/**
 * Replays the last track this guild played.
 *
 * The source of truth is an in-memory map in queue.ts rather than the queue
 * itself, because the queue is torn down when playback ends — which is precisely
 * when you want this. Nothing is persisted; after a restart there is no "again".
 */
@ApplyOptions<Command.Options>({
    name: 'again',
    aliases: ['replay'],
    description: 'Play the last song again',
    runIn: 'GUILD_ANY',
})
export class AgainCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) => guildOnly(b).setName('again').setDescription('Play the last song again'))
    }

    public override async messageRun(message: Message) {
        await this.again(message)
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply()
        await this.again(interaction, true)
    }

    private async again(ctx: MusicCtx, deferred = false) {
        const respond = async (key: string, vars?: Record<string, unknown>) => {
            const text = await resolveKey(ctx, key, vars)
            if (deferred && ctx instanceof ChatInputCommandInteraction) return ctx.editReply(v2(text))
            return ctx.reply(v2(text))
        }

        if (!(await awaitNode())) return respond('common:musicNodeOffline')

        const track = getLastPlayed(ctx.guild!.id)
        if (!track) return respond('common:musicNothingToReplay')

        const channel = voiceChannelOf(ctx)
        if (!channel) return respond('common:musicNoVoice')

        try {
            const requesterId = ctx instanceof Message ? ctx.author.id : ctx.user.id
            const queue = await createQueue(
                ctx.guild!.id,
                channel.id,
                ctx.guild!.shardId,
                ctx.channel as SendableChannels
            )
            queue.add(track, requesterId)
            queue.voiceChannelName = channel.name
            await queue.start()
            await showPanel(queue, ctx.channel as SendableChannels, requesterId)
            return respond('common:musicQueued', { title: track.info.title })
        } catch (error) {
            if (error instanceof DifferentVoiceChannelError) {
                return respond('common:musicDifferentVoice')
            }
            this.container.logger.error('[music] /again failed:', error)
            return respond('common:musicNotFound')
        }
    }
}
