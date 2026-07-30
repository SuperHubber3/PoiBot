// In-memory cache of the last deleted message per guild, shared between the
// messageDelete (writer) and messageCreate (reader, on "poi snipe") listeners.
export interface SnipeEntry {
    timestamp: number
    tag: string
    content: string
    channelId: string
}

export const snipeCache = {} as Record<string, SnipeEntry>

// "Already sniped" is tracked per guild. It used to be one global flag, which
// meant a snipe in ANY guild silently blocked every other guild's snipe until
// the next message was deleted there.
const fetched = new Set<string>()

export const snipeState = {
    wasFetched: (guildId: string) => fetched.has(guildId),
    markFetched: (guildId: string) => fetched.add(guildId),
    clearFetched: (guildId: string) => fetched.delete(guildId),
}
