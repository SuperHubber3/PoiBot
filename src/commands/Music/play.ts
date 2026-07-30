import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message, SendableChannels } from 'discord.js'
import { resolveQuery } from '../../lib/music/search.js'
import { createQueue, DifferentVoiceChannelError } from '../../lib/music/queue.js'
import { showPanel } from '../../lib/music/panel.js'
import { awaitNode, hasNode } from '../../lib/services/lavalink.service.js'
import { MusicCtx, voiceChannelOf } from '../../lib/util/music-ctx.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

/** Upper bound on how much of a resolved playlist gets queued in one go. */
const MAX_PLAYLIST_TRACKS = 500

@ApplyOptions<Command.Options>({
    name: 'play',
    aliases: ['p'],
    description: 'Play a song or add it to the queue',
    runIn: 'GUILD_ANY',
})
export class PlayCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('play')
                .setDescription('Play a song or add it to the queue')
                .addStringOption((opt) => opt.setName('query').setDescription('Song name or URL').setRequired(true))
        )
    }

    public override async messageRun(message: Message, args: Args) {
        const query = await args.rest('string').catch(() => '')
        await this.play(message, query)
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const query = interaction.options.getString('query', true)
        await interaction.deferReply()
        await this.play(interaction, query, true)
    }

    private async play(ctx: MusicCtx, query: string, deferred = false) {
        const respond = async (key: string, vars?: Record<string, unknown>) => {
            const text = await resolveKey(ctx, key, vars)
            // NOTE: editReply must carry the IsComponentsV2 flag itself (v2() includes
            // it). v2Update() is flagless and only valid for interaction.update() on a
            // message that is already V2 — using it here makes Discord reject the
            // Container with "type must be one of (1,)".
            if (deferred && ctx instanceof ChatInputCommandInteraction) {
                return ctx.editReply(v2(text))
            }
            return ctx.reply(v2(text))
        }

        // Waits briefly for the node instead of failing instantly, so invoking
        // music during a (re)start handshake doesn't falsely report it offline.
        if (!(await awaitNode())) return respond('common:musicNodeOffline')

        const channel = voiceChannelOf(ctx)
        if (!channel) return respond('common:musicNoVoice')
        if (!query.trim()) return respond('common:musicNotFound')

        try {
            const found = await resolveQuery(query)
            if (!found?.tracks.length) return respond('common:musicNotFound')
            const queue = await createQueue(
                ctx.guild!.id,
                channel.id,
                ctx.guild!.shardId,
                ctx.channel as SendableChannels
            )

            const requesterId = ctx instanceof Message ? ctx.author.id : ctx.user.id
            // A public playlist can hold thousands of entries, and every one of
            // them would sit in memory and be walked on each /queue render. Take
            // the front of it and say so rather than silently keeping the lot.
            const tracks = found.playlistName
                ? found.tracks.slice(0, MAX_PLAYLIST_TRACKS)
                : found.tracks.slice(0, 1)
            if (found.playlistName && found.tracks.length > tracks.length) {
                this.container.logger.info(
                    `[music] playlist "${found.playlistName}" truncated: queued ${tracks.length} of ${found.tracks.length}`
                )
            }
            for (const track of tracks) queue.add(track, requesterId)
            queue.voiceChannelName = channel.name
            await queue.start()

            // Now Playing panel lives in the channel the command was used in.
            await showPanel(queue, ctx.channel as SendableChannels, requesterId)

            if (found.playlistName) {
                return respond('common:musicPlaylistQueued', {
                    playlist: found.playlistName,
                    count: tracks.length,
                })
            }
            return respond('common:musicQueued', { title: tracks[0].info.title })
        } catch (error) {
            if (error instanceof DifferentVoiceChannelError) {
                return respond('common:musicDifferentVoice')
            }
            // Log it — otherwise a join/resolve failure is indistinguishable from
            // "no results" and there's nothing to debug from.
            this.container.logger.error('[music] /play failed:', error)
            return respond(hasNode() ? 'common:musicNotFound' : 'common:musicNodeOffline')
        }
    }
}
