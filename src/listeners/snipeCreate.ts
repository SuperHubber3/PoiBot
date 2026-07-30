import { ApplyOptions } from '@sapphire/decorators'
import { Events, Listener } from '@sapphire/framework'
import { Message, TextBasedChannel } from 'discord.js'
import { snipeCache, snipeState } from '../lib/state/snipe.js'

// Responds to "poi snipe" with the last deleted message (once, until a new delete).
@ApplyOptions<Listener.Options>({ event: Events.MessageCreate })
export class SnipeCreateListener extends Listener<typeof Events.MessageCreate> {
    public override run(message: Message) {
        if (!message.guild || message.author.bot) return
        if (message.content.toLowerCase() !== 'poi snipe') return
        if (snipeState.wasFetched(message.guild.id)) return

        const snipe = snipeCache[message.guild.id]
        if (!snipe || snipe.channelId !== message.channelId) return

        if (message.channel.isTextBased() && 'send' in message.channel) {
            // Missing Send Messages would otherwise reject unhandled and crash the process.
            void (message.channel as TextBasedChannel & { send: Function })
                .send({
                    content: `<t:${snipe.timestamp}:R> ${snipe.tag}: ${snipe.content}`,
                    allowedMentions: { parse: [] },
                })
                .catch(() => {})
        }
        snipeState.markFetched(message.guild.id)
    }
}
