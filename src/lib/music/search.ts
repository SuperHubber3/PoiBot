import type { Track } from 'shoukaku'
import { idealNode } from '../services/lavalink.service.js'

/**
 * Track resolution with a search fallback chain.
 *
 * Plain `ytsearch:` currently returns empty results from YouTube's web search
 * endpoint, while YouTube Music search, direct URLs and SoundCloud all work — so
 * searches are tried in that order rather than failing outright.
 */
const SEARCH_PREFIXES = ['ytmsearch', 'ytsearch', 'scsearch'] as const

export interface ResolvedQuery {
    tracks: Track[]
    /** Present when the query resolved to a playlist. */
    playlistName?: string
}

const isUrl = (query: string) => /^https?:\/\//i.test(query)

function unwrap(result: any): ResolvedQuery | null {
    if (!result) return null
    switch (result.loadType) {
        case 'track':
            return { tracks: [result.data as Track] }
        case 'search':
            return { tracks: (result.data as Track[]) ?? [] }
        case 'playlist':
            return {
                tracks: (result.data?.tracks as Track[]) ?? [],
                playlistName: result.data?.info?.name,
            }
        default:
            return null
    }
}

/**
 * Resolves a user query into playable tracks.
 * Returns null when nothing could be found (or no node is available).
 */
export async function resolveQuery(query: string): Promise<ResolvedQuery | null> {
    const node = idealNode()
    if (!node) return null

    const trimmed = query.trim()
    if (!trimmed) return null

    // Direct links (YouTube, Spotify via LavaSrc, SoundCloud, raw http streams…).
    if (isUrl(trimmed)) {
        const found = unwrap(await node.rest.resolve(trimmed).catch(() => undefined))
        return found && found.tracks.length ? found : null
    }

    for (const prefix of SEARCH_PREFIXES) {
        const found = unwrap(await node.rest.resolve(`${prefix}:${trimmed}`).catch(() => undefined))
        if (found && found.tracks.length) return found
    }
    return null
}
