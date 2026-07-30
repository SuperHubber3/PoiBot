import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import { getQueue } from '../../lib/music/queue.js'
import { MusicCtx, guildIdOf } from '../../lib/util/music-ctx.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

function timestamp(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000))
    const minutes = Math.floor(total / 60)
    const seconds = total % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function progress(position: number, length: number, stream: boolean): string {
    if (stream) return '`LIVE`'
    const safeLength = Math.max(1, length)
    const ratio = Math.max(0, Math.min(1, position / safeLength))
    const filled = Math.round(ratio * 14)
    return `\`${timestamp(position)}\` ${'▬'.repeat(filled)}🔘${'▬'.repeat(14 - filled)} \`${timestamp(length)}\``
}

@ApplyOptions<Command.Options>({ name: 'nowplaying', aliases: ['np'], description: 'Show the current song', runIn: 'GUILD_ANY' })
export class NowPlayingCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) => guildOnly(b).setName('nowplaying').setDescription('Show the current song'))
    }
    public override messageRun(message: Message) {
        return this.run(message)
    }
    public override chatInputRun(interaction: ChatInputCommandInteraction) {
        return this.run(interaction)
    }
    private async run(ctx: MusicCtx) {
        const queue = getQueue(guildIdOf(ctx))
        if (!queue?.current) return ctx.reply(v2(await resolveKey(ctx, 'common:musicNothingPlaying')))

        const { track, requesterId } = queue.current
        const info = track.info
        const bar = progress(queue.player.position, info.length, info.isStream)
        const title = await resolveKey(ctx, 'misc:musicNowPlayingTitle')
        const requestedBy = await resolveKey(ctx, 'misc:musicRequestedBy', {
            user: `<@${requesterId}>`,
        })
        const displayTitle = info.uri ? `[${info.title}](${info.uri})` : info.title
        const payload = v2([`## ${title}`, `**${displayTitle}**\n${bar}\n${requestedBy}`], {
            thumbnail: info.artworkUrl,
        })

        return ctx.reply({ ...payload, allowedMentions: { parse: [] } })
    }
}
