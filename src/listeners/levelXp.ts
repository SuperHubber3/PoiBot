import { ApplyOptions } from '@sapphire/decorators'
import { Events, Listener } from '@sapphire/framework'
import { ChannelType, Message } from 'discord.js'
import { addXP } from '../lib/functions/economy.js'

// Grants XP on every non-bot guild message (the "level system").
@ApplyOptions<Listener.Options>({ event: Events.MessageCreate })
export class LevelXpListener extends Listener<typeof Events.MessageCreate> {
    public override run(message: Message) {
        const { guild, member } = message
        if (message.author.bot) return
        if (message.channel.type === ChannelType.DM) return
        if (!guild || !member) return
        // Fire-and-forget, but never unhandled: a mongo hiccup here would otherwise
        // become an unhandled rejection and take the process down on every message.
        void addXP(guild.id, member.id, 23, message).catch((error) =>
            this.container.logger.error('[levelXp] addXP failed', error)
        )
    }
}
