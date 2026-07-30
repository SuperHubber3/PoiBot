import { ApplyOptions } from '@sapphire/decorators'
import { Events, Listener } from '@sapphire/framework'
import { ChannelType, Message } from 'discord.js'
import { BOT_OWNERS } from '../lib/constants.js'

const consented = new Set<string>()
const CONSENT_PHRASE = 'I consent'

// Forwards DMs sent to the bot to the primary owner.
@ApplyOptions<Listener.Options>({ event: Events.MessageCreate })
export class DmRedirectListener extends Listener<typeof Events.MessageCreate> {
    public override async run(message: Message) {
        if (message.author.bot) return
        if (message.channel.type !== ChannelType.DM) return
        const owner = BOT_OWNERS[0]
        if (!owner || message.author.id === owner) return

        if (!consented.has(message.author.id)) {
            if (message.content.trim().toLowerCase() === CONSENT_PHRASE.toLowerCase()) {
                consented.add(message.author.id)
                await message.reply({
                    content: 'Consent saved for this bot session. Future DMs will be forwarded to the bot owner for support.',
                    allowedMentions: { parse: [] },
                }).catch(() => {})
                return
            }
            await message.reply({
                content:
                    `This bot can forward your DMs and account ID to its owner for support. ` +
                    `Reply exactly **${CONSENT_PHRASE}** to allow future messages to be forwarded.`,
                allowedMentions: { parse: [] },
            }).catch(() => {})
            return
        }

        await this.container.client.users
            .send(owner, {
                content: `📩 **[DM] ${message.author.tag}** (${message.author.id}):\n${message.content || '*no content*'}`,
                allowedMentions: { parse: [] },
            })
            .catch(() => {})
    }
}
