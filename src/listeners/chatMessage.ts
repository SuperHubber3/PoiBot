import { ApplyOptions } from '@sapphire/decorators'
import { Events, Listener } from '@sapphire/framework'
import { Message } from 'discord.js'
import { ConversationWindow } from '../lib/chat/conversation.js'
import { respondToChat } from '../lib/chat/respond.js'
import { resolveKey } from '@sapphire/plugin-i18next'

const configuredTimeout = Number(process.env.CHAT_IDLE_SECONDS || 300)
const conversations = new ConversationWindow(
    (Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 300) * 1000,
)

@ApplyOptions<Listener.Options>({ event: Events.MessageCreate })
export class ChatMessageListener extends Listener<typeof Events.MessageCreate> {
    private readonly pending = new Map<string, { tail: Promise<void>; count: number }>()

    public override async run(message: Message) {
        if (process.env.CHAT_ENABLED !== 'true' || !message.guildId || message.author.bot
            || message.webhookId || message.system) return
        const botId = this.container.client.user?.id
        if (!botId) return
        const scope = `${message.guildId}-${message.channelId}`
        const text = conversations.accept({
            key: scope, content: message.content, botId, now: Date.now(),
        })
        if (text === null) return
        const queue = this.pending.get(scope) ?? { tail: Promise.resolve(), count: 0 }
        if (queue.count >= 5) {
            await message.reply({ content: await resolveKey(message, 'chat:busy'), allowedMentions: { parse: [] } }).catch(() => {})
            return
        }
        queue.count++
        // Preserve message order when someone sends a follow-up before the first reply finishes.
        queue.tail = queue.tail.then(async () => {
            const typing = async () => {
                if ('sendTyping' in message.channel) await message.channel.sendTyping().catch(() => {})
            }
            void typing()
            const timer = setInterval(() => { void typing() }, 8000)
            try {
                const content = await respondToChat(message, scope, { kind: 'say', text, speaker: { id: message.author.id, name: message.member?.displayName ?? message.author.username } })
                await message.reply({ content, allowedMentions: { parse: [] } })
            } finally { clearInterval(timer) }
        }).catch(() => {
            this.container.logger.warn('[chat] Could not deliver a chat reply')
        }).finally(() => {
            queue.count--
            if (queue.count === 0) this.pending.delete(scope)
        })
        this.pending.set(scope, queue)
        await queue.tail
    }
}
