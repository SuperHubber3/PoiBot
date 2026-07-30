import { container } from '@sapphire/framework'
import sessionSchema from '../models/session-schema.js'

/**
 * Store for transient interaction state (a pulled waifu, a pending trade offer,
 * a generated story, a tycoon session…), keyed by the message id of the
 * component message.
 *
 * Two backends, chosen per call:
 *   - default (in-memory): fast, auto-expires, LOST on restart.
 *   - persist:true (MongoDB): survives restarts (uses a TTL index).
 *
 * On a miss (expired or process restarted with in-memory data), callers should
 * show a graceful "this menu expired, run the command again" message instead of
 * letting the interaction fail.
 */

const DEFAULT_TTL_MS = 1000 * 60 * 15 // 15 minutes

interface MemoryEntry {
    data: unknown
    timer: NodeJS.Timeout
    persist: false
}

const memory = new Map<string, MemoryEntry>()

export interface SessionOptions {
    /** Persist to MongoDB so the session survives restarts. Default false. */
    persist?: boolean
    /** Lifetime in ms. Default 15 minutes. */
    ttlMs?: number
}

export const sessions = {
    async create<T>(key: string, data: T, opts: SessionOptions = {}): Promise<void> {
        const ttl = opts.ttlMs ?? DEFAULT_TTL_MS
        if (opts.persist) {
            await sessionSchema.findOneAndUpdate(
                { key },
                { key, data, expiresAt: new Date(Date.now() + ttl) },
                { upsert: true }
            )
            return
        }
        this.deleteMemory(key)
        const timer = setTimeout(() => memory.delete(key), ttl)
        timer.unref?.()
        memory.set(key, { data, timer, persist: false })
    },

    async get<T>(key: string): Promise<T | null> {
        const mem = memory.get(key)
        if (mem) return mem.data as T
        const doc = await sessionSchema.findOne({ key })
        if (!doc) return null
        if (doc.expiresAt && doc.expiresAt.getTime() < Date.now()) {
            await sessionSchema.deleteOne({ key })
            return null
        }
        return doc.data as T
    },

    /**
     * Drops a session. Returns false when the persisted copy could not be
     * removed, so a caller that treats deletion as "this is now consumed" can
     * tell the difference instead of carrying on against a session that is
     * still reachable from another click or after a restart.
     */
    async delete(key: string): Promise<boolean> {
        this.deleteMemory(key)
        try {
            await sessionSchema.deleteOne({ key })
            return true
        } catch (error) {
            container.logger.warn(`[sessions] could not delete persisted session ${key}`, error)
            return false
        }
    },

    /** Atomically consumes a session, returning it only to the winning caller. */
    async take<T>(key: string): Promise<T | null> {
        const mem = memory.get(key)
        if (mem) {
            this.deleteMemory(key)
            return mem.data as T
        }
        const doc = await sessionSchema.findOneAndDelete({
            key,
            expiresAt: { $gt: new Date() },
        })
        return doc ? doc.data as T : null
    },

    /** Acquires the standard busy lock used by long-running component actions. */
    async acquire<T extends { busy?: boolean; resolved?: boolean }>(key: string): Promise<T | null> {
        const mem = memory.get(key)
        if (mem) {
            const data = mem.data as T
            if (data.busy || data.resolved) return null
            data.busy = true
            return data
        }
        const doc = await sessionSchema.findOneAndUpdate(
            {
                key,
                expiresAt: { $gt: new Date() },
                'data.busy': { $ne: true },
                'data.resolved': { $ne: true },
            },
            { $set: { 'data.busy': true } },
            { new: true }
        )
        return doc ? doc.data as T : null
    },

    async patch<T>(key: string, patch: Partial<T>): Promise<T | null> {
        const mem = memory.get(key)
        if (mem) {
            Object.assign(mem.data as object, patch)
            return mem.data as T
        }
        const update = Object.fromEntries(
            Object.entries(patch as object).map(([field, value]) => [`data.${field}`, value])
        )
        const doc = await sessionSchema.findOneAndUpdate(
            { key, expiresAt: { $gt: new Date() } },
            { $set: update },
            { new: true }
        )
        return doc ? doc.data as T : null
    },

    /** Updates one multi-roll summary entry without rewriting sibling states. */
    async patchSummaryEntry<T>(key: string, messageId: string, state: string): Promise<T | null> {
        const mem = memory.get(key)
        if (mem) {
            const data: any = mem.data
            const entry = data.entries?.find((item: any) => item.messageId === messageId)
            if (!entry) return null
            entry.state = state
            return data as T
        }
        const doc = await sessionSchema.findOneAndUpdate(
            { key, expiresAt: { $gt: new Date() }, 'data.entries.messageId': messageId },
            { $set: { 'data.entries.$[entry].state': state } },
            { new: true, arrayFilters: [{ 'entry.messageId': messageId }] }
        )
        return doc ? doc.data as T : null
    },

    deleteMemory(key: string): void {
        const mem = memory.get(key)
        if (mem) {
            clearTimeout(mem.timer)
            memory.delete(key)
        }
    },
}
