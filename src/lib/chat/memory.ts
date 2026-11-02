import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface Memory { key: string; fact: string }
export const MAX_MEMORIES = 30

export function parseMemories(value: unknown): Memory[] {
    if (!Array.isArray(value) || value.length > MAX_MEMORIES) throw new Error('Invalid memory list')
    const keys = new Set<string>()
    return value.map((item: unknown) => {
        if (typeof item !== 'object' || item === null || !('key' in item) || !('fact' in item)
            || typeof item.key !== 'string' || !/^[a-z0-9_-]{1,48}$/.test(item.key)
            || typeof item.fact !== 'string' || !item.fact.trim() || item.fact.length > 240
            || keys.has(item.key)) throw new Error('Invalid memory')
        keys.add(item.key)
        return { key: item.key, fact: item.fact.trim() }
    })
}

/** A single bot process owns this directory. Callers serialize operations per scope. */
export class MemoryStore {
    constructor(private readonly directory: string) {}

    private file(scope: string) {
        if (!/^\d+-\d+$/.test(scope)) throw new Error('Invalid chat scope')
        return join(this.directory, `channel-${scope}.json`)
    }

    async read(scope: string): Promise<Memory[]> {
        try {
            const value: unknown = JSON.parse(await readFile(this.file(scope), 'utf8'))
            return parseMemories(value)
        } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
            throw error
        }
    }

    async write(scope: string, memories: Memory[]) {
        const file = this.file(scope)
        await mkdir(this.directory, { recursive: true, mode: 0o700 })
        const temporary = `${file}.${randomUUID()}.tmp`
        try {
            await writeFile(temporary, JSON.stringify(parseMemories(memories), null, 2), { mode: 0o600 })
            await rename(temporary, file)
        } finally {
            await rm(temporary, { force: true })
        }
    }

    async forget(scope: string) { await rm(this.file(scope), { force: true }) }
}
