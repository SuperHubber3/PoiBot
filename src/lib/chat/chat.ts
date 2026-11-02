import { resolve } from 'node:path'
import { askModel } from './model.js'
import { chatSettings, type ChatSettingsStore } from './settings.js'
import { MAX_MEMORIES, MemoryStore } from './memory.js'

type Speaker = { id: string; name: string }
type Turn = { speaker: Speaker; user: string; assistant: string }
export type ChatAction = { kind: 'say'; text: string; speaker: Speaker } | { kind: 'memories' } | { kind: 'forget'; key: string } | { kind: 'reset' }
export class ChatError extends Error {}

export class ChatService {
    private readonly active = new Set<string>()
    private readonly sessions = new Map<string, { turns: Turn[]; updated: number }>()

    constructor(private readonly store: MemoryStore, private readonly ask = askModel, private readonly settings: ChatSettingsStore = chatSettings) {}

    async run(scope: string, action: ChatAction): Promise<{ text: string; saved: number }> {
        if (this.active.has(scope) || this.active.size >= 3) throw new ChatError('busy')
        this.active.add(scope)
        try {
            const now = Date.now()
            for (const [key, session] of this.sessions) {
                if (now - session.updated > 30 * 60_000) this.sessions.delete(key)
            }
            if (action.kind === 'reset') {
                this.sessions.delete(scope)
                return { text: 'reset', saved: 0 }
            }
            if (action.kind === 'forget' && action.key === 'all') {
                await this.store.forget(scope)
                this.sessions.delete(scope)
                return { text: 'forgotten', saved: 0 }
            }
            const memories = await this.store.read(scope)
            if (action.kind === 'memories') {
                return { text: memories.map((memory) => `${memory.key}: ${memory.fact}`).join('\n'), saved: 0 }
            }
            if (action.kind === 'forget') {
                const remaining = memories.filter((memory) => memory.key !== action.key)
                if (remaining.length === memories.length) throw new ChatError('missing')
                await this.store.write(scope, remaining)
                this.sessions.delete(scope)
                return { text: 'forgotten', saved: 0 }
            }
            if (!action.text.trim() || action.text.length > 4000) throw new ChatError('length')
            const turns = this.sessions.get(scope)?.turns ?? []
            const settings = await this.settings.read(scope)
            const response = await this.ask(JSON.stringify({ memories, recentConversation: turns, currentSpeaker: action.speaker, currentMessage: action.text }), settings)
            let saved = 0
            for (const proposal of response.remember) {
                const existing = memories.find((memory) => memory.key === proposal.key)
                if (existing) {
                    if (existing.fact !== proposal.fact) { existing.fact = proposal.fact; saved++ }
                } else if (memories.length < MAX_MEMORIES) {
                    memories.push(proposal)
                    saved++
                }
            }
            if (saved) await this.store.write(scope, memories)
            if (this.sessions.size >= 1000 && !this.sessions.has(scope)) {
                const oldest = this.sessions.keys().next().value
                if (oldest !== undefined) this.sessions.delete(oldest)
            }
            this.sessions.set(scope, { turns: [...turns, { speaker: action.speaker, user: action.text, assistant: response.reply }].slice(-6), updated: now })
            return { text: response.reply, saved }
        } finally { this.active.delete(scope) }
    }
}

export const chatService = new ChatService(new MemoryStore(resolve(process.env.CHAT_MEMORY_DIR || 'data/chat-memory')))
