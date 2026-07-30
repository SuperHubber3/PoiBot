import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import { getQueue } from '../../lib/music/queue.js'
import { MusicCtx, guildIdOf } from '../../lib/util/music-ctx.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

function duration(ms: number, stream: boolean): string {
    if (stream) return 'LIVE'
    const total = Math.max(0, Math.floor(ms / 1000))
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const seconds = total % 60
    return hours
        ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        : `${minutes}:${seconds.toString().padStart(2, '0')}`
}

@ApplyOptions<Command.Options>({ name: 'queue', aliases: ['q'], description: 'Show the current queue', runIn: 'GUILD_ANY' })
export class QueueCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) => guildOnly(b).setName('queue').setDescription('Show the current queue'))
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

        const upcoming = queue.tracks.slice(0, 10)
        const lines = upcoming.map(
            ({ track }, i) =>
                `**${i + 1}.** ${track.info.title} \`${duration(track.info.length, track.info.isStream)}\``
        )
        const extra = queue.tracks.length - upcoming.length

        const [title, nowPlaying, empty, more] = await Promise.all([
            resolveKey(ctx, 'misc:musicQueueTitle'),
            resolveKey(ctx, 'misc:musicQueueNowPlaying'),
            resolveKey(ctx, 'common:musicQueueEmpty'),
            extra > 0 ? resolveKey(ctx, 'misc:musicQueueMore', { count: extra }) : Promise.resolve(''),
        ])
        const payload = v2([
            `## ${title}`,
            `**${nowPlaying}:** ${queue.current.track.info.title}\n\n` +
                (lines.length ? lines.join('\n') : empty) +
                (more ? `\n\n${more}` : ''),
        ])

        return ctx.reply({ ...payload, allowedMentions: { parse: [] } })
    }
}
