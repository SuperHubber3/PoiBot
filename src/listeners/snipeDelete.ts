import { ApplyOptions } from '@sapphire/decorators'
import { Events, Listener } from '@sapphire/framework'
import { Message, PartialMessage } from 'discord.js'
import { snipeCache, snipeState } from '../lib/state/snipe.js'

// Caches the most recently deleted message per guild for the "poi snipe" command.
@ApplyOptions<Listener.Options>({ event: Events.MessageDelete })
export class SnipeDeleteListener extends Listener<typeof Events.MessageDelete> {
    public override run(message: Message | PartialMessage) {
        if (!message.guild || !message.author || message.author.bot) return
        snipeCache.set(message.guild.id, {
            timestamp: Math.floor(message.createdTimestamp / 1000),
            tag: message.author.tag,
            content: message.content ?? '',
            channelId: message.channelId,
        })
        snipeState.clearFetched(message.guild.id)
    }
}
