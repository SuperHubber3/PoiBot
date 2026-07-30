// In-memory cache of the last deleted message per guild, shared between the
// messageDelete (writer) and messageCreate (reader, on "poi snipe") listeners.
export interface SnipeEntry {
    timestamp: number
    tag: string
    content: string
    channelId: string
}

/**
 * How long a deleted message stays snipeable.
 *
 * Someone deleting a message expects it to be gone. Keeping the text around for
 * the rest of the process's life so it can be resurrected hours later is not
 * what "snipe" means, so entries expire and are dropped once served.
 */
const SNIPE_TTL_MS = 5 * 60 * 1000

const cache = new Map<string, SnipeEntry & { expiresAt: number }>()

// "Already sniped" is tracked per guild. It used to be one global flag, which
// meant a snipe in ANY guild silently blocked every other guild's snipe until
// the next message was deleted there.
const fetched = new Set<string>()

export const snipeCache = {
    set(guildId: string, entry: SnipeEntry): void {
        cache.set(guildId, { ...entry, expiresAt: Date.now() + SNIPE_TTL_MS })
    },
    /** The guild's snipeable message, or undefined once it has expired. */
    get(guildId: string): SnipeEntry | undefined {
        const entry = cache.get(guildId)
        if (!entry) return undefined
        if (Date.now() >= entry.expiresAt) {
            cache.delete(guildId)
            return undefined
        }
        return entry
    },
    /** Called after a snipe is served: the content has done its job. */
    consume(guildId: string): void {
        cache.delete(guildId)
    },
}

export const snipeState = {
    wasFetched: (guildId: string) => fetched.has(guildId),
    markFetched: (guildId: string) => fetched.add(guildId),
    clearFetched: (guildId: string) => fetched.delete(guildId),
}
