import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export const REASONING_LEVELS = ['low', 'medium', 'high', 'xhigh'] as const
export const SERVICE_TIERS = ['normal', 'fast'] as const
export type ChatSettings = {
    model: string
    reasoning: typeof REASONING_LEVELS[number]
    tier: typeof SERVICE_TIERS[number]
}
export const DEFAULT_CHAT_SETTINGS: Readonly<ChatSettings> = {
    model: 'gemini-3.8-flash', reasoning: 'low', tier: 'normal',
}

export function parseChatSettings(value: unknown): ChatSettings {
    if (typeof value !== 'object' || value === null || !('model' in value)
        || typeof value.model !== 'string' || !/^(?:gemini|gpt)-[a-z0-9.-]{1,90}$/.test(value.model)
        || !('reasoning' in value) || !('tier' in value)) throw new Error('Invalid chat settings')
    const reasoning = REASONING_LEVELS.find((level) => level === value.reasoning)
    const tier = SERVICE_TIERS.find((level) => level === value.tier)
    if (!reasoning || !tier) throw new Error('Invalid chat settings')
    if (value.model.startsWith('gemini-') && (reasoning === 'xhigh' || tier === 'fast')) {
        throw new Error('Gemini supports low, medium, or high reasoning and normal service tier through Antigravity.')
    }
    return { model: value.model, reasoning, tier }
}

export class ChatSettingsStore {
    private tail: Promise<unknown> = Promise.resolve()
    constructor(private readonly directory: string) {}

    private file(scope: string) {
        if (!/^\d+-\d+$/.test(scope)) throw new Error('Invalid chat scope')
        return join(this.directory, `settings-${scope}.json`)
    }

    async read(scope: string): Promise<ChatSettings> {
        try { return parseChatSettings(JSON.parse(await readFile(this.file(scope), 'utf8'))) }
        catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return { ...DEFAULT_CHAT_SETTINGS }
            throw error
        }
    }

    update(scope: string, patch: Partial<Record<keyof ChatSettings, string>>): Promise<ChatSettings> {
        const operation = this.tail.then(async () => {
            const settings = parseChatSettings({ ...await this.read(scope), ...patch })
            const file = this.file(scope)
            await mkdir(this.directory, { recursive: true, mode: 0o700 })
            const temporary = `${file}.${randomUUID()}.tmp`
            try {
                await writeFile(temporary, JSON.stringify(settings, null, 2), { mode: 0o600 })
                await rename(temporary, file)
            } finally { await rm(temporary, { force: true }) }
            return settings
        })
        this.tail = operation.catch(() => {})
        return operation
    }
}

export const chatSettings = new ChatSettingsStore(resolve(process.env.CHAT_MEMORY_DIR || 'data/chat-memory'))
