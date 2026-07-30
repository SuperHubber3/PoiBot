import { ApplyOptions } from '@sapphire/decorators'
import { Events, Listener } from '@sapphire/framework'
import { Message, PartialMessage } from 'discord.js'

// Announces when a message containing a mention gets deleted (a "ghost ping").
@ApplyOptions<Listener.Options>({ event: Events.MessageDelete })
export class GhostPingListener extends Listener<typeof Events.MessageDelete> {
    public override run(message: Message | PartialMessage) {
        if (!message.guild || !message.author || message.author.bot) return
        const content = message.content ?? ''
        const hasMention = /<@[!&]?\d+>/.test(content) || (message.mentions?.users.size ?? 0) > 0
        if (!hasMention) return
        if (!message.channel.isSendable()) return

        message.channel
            .send({
                content: `👻 Ghost ping by **${message.author.tag}**: ${content}`,
                allowedMentions: { parse: [] },
            })
            .catch(() => {})
    }
}
