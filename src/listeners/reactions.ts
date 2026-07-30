import { ApplyOptions } from '@sapphire/decorators'
import { Events, Listener } from '@sapphire/framework'
import { Message } from 'discord.js'

const POISUPPORT = '993084390722772992'
const SUS_EMOJI = '1040228714602053643'

// Per-(guild,user) cooldown so the bot doesn't spam-react.
const cooldowns = {} as { [key: string]: boolean }
const startCooldown = (key: string) => {
    cooldowns[key] = true
    setTimeout(() => {
        delete cooldowns[key]
    }, 1000 * 60 * 5)
}

// True when `phrase` appears as a standalone word in the content.
const containsWord = (content: string, phrase: string) => {
    if (content === phrase) return true
    if (content.includes(' ' + phrase)) return true
    if (content.includes(phrase + ' ')) return true
    return false
}

// Auto-reacts to certain phrases ("sus", "forgor").
@ApplyOptions<Listener.Options>({ event: Events.MessageCreate })
export class ReactionsListener extends Listener<typeof Events.MessageCreate> {
    public override run(message: Message) {
        const { guild, author } = message
        if (!guild) return

        const key = `${guild.id}-${author.id}`
        if (cooldowns[key]) return

        const content = message.content.toLowerCase()

        // react() rejects when the bot lacks Add Reactions in the channel; without a
        // catch that is an unhandled rejection, which kills the process.
        if (content === 'sus') {
            const sus = this.container.client.guilds.cache.get(POISUPPORT)?.emojis.cache.get(SUS_EMOJI)
            if (sus) void message.react(sus).catch(() => {})
            startCooldown(key)
        }
        if (containsWord(content, 'forgor')) {
            void message.react('💀').catch(() => {})
            startCooldown(key)
        }
    }
}
