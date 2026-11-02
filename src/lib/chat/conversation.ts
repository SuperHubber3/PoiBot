/** Tracks active channels. Any participant can continue a conversation after a mention. */
export class ConversationWindow {
    private readonly expires = new Map<string, number>()

    constructor(private readonly timeoutMs: number) {
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid chat timeout')
    }

    accept(input: { key: string; content: string; botId: string; now: number }): string | null {
        for (const [key, expiry] of this.expires) {
            if (expiry <= input.now) this.expires.delete(key)
        }
        // Keep normal PoiBot commands out of the conversation.
        if (/^poi\s/i.test(input.content.trim())) return null
        const mention = new RegExp(`<@!?${input.botId}>`, 'g')
        const mentioned = mention.test(input.content)
        const text = input.content.replace(mention, '').trim()
        if (!text || (!mentioned && !this.expires.has(input.key))) return null
        if (this.expires.size >= 1000 && !this.expires.has(input.key)) {
            const oldest = this.expires.keys().next().value
            if (oldest !== undefined) this.expires.delete(oldest)
        }
        this.expires.delete(input.key)
        this.expires.set(input.key, input.now + this.timeoutMs)
        return text
    }
}
