import { FailedAnimeIdsService } from './failed-anime-ids.service.js'

// Upper bound of MAL anime ids, same as the original bot. Many ids in range are
// invalid and get blacklisted as they're discovered.
const MAX_ANIME_ID = 61599
const MAL_BASE = 'https://api.myanimelist.net/v2'
const REQUEST_TIMEOUT_MS = 5_000
const ROLL_BUDGET_MS = 15_000
/** Pause after a 429 before trying another id, so we stop leaning on the API. */
const THROTTLE_BACKOFF_MS = 1_000

class MalRequestError extends Error {
    public constructor(public readonly status: number, message: string) {
        super(message)
    }
}

const HTML_ENTITIES: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: '\u00a0',
}

/**
 * MAL returns names and titles with HTML entities escaped. Decode each entity
 * exactly once so input such as `&amp;#039;` remains `&#039;` rather than being
 * double-decoded into an apostrophe.
 */
export function decodeHtmlEntities(text: string): string {
    return text.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (entity, decimal, hex, named) => {
        if (decimal !== undefined || hex !== undefined) {
            const codePoint = Number.parseInt(decimal ?? hex, decimal !== undefined ? 10 : 16)
            if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return entity
            try {
                return String.fromCodePoint(codePoint)
            } catch {
                return entity
            }
        }
        return HTML_ENTITIES[String(named).toLowerCase()] ?? entity
    })
}

export interface MalCharacter {
    id: number
    name: string
    image: string | null
    animeId: number
    animeName: string
    /** Sell/claim price derived from the anime's mean score. */
    price: number
}

function headers() {
    const clientId = process.env.MAL_CLIENT_ID
    if (!clientId) throw new MalRequestError(401, 'MAL_CLIENT_ID is missing')
    return { 'X-MAL-CLIENT-ID': clientId }
}

function requestSignal(deadline?: number): AbortSignal {
    const remaining = deadline === undefined ? REQUEST_TIMEOUT_MS : deadline - Date.now()
    if (remaining <= 0) throw new MalRequestError(408, 'MAL request budget exhausted')
    return AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining))
}

function validateResponse(res: Response): boolean {
    if (res.ok) return true
    if ([401, 403, 429].includes(res.status)) {
        throw new MalRequestError(res.status, `MAL request failed with ${res.status}`)
    }
    if (res.status === 404) return false
    throw new MalRequestError(res.status, `MAL request failed with ${res.status}`)
}

/** Floor for any character's value — also the fallback for legacy priceless cards. */
export const MIN_WAIFU_PRICE = 10

/** Price formula carried over from the source: ceil(mean * 10 / 2), min 10. */
export function priceFromMean(mean: number | undefined | null): number {
    return Math.max(Math.ceil((mean ?? 0) * 10 / 2) || MIN_WAIFU_PRICE, MIN_WAIFU_PRICE)
}

/**
 * animeId -> price, so recomputing the value of old cards (which were never
 * stored with one) costs at most one MAL call per anime per process.
 */
const priceCache = new Map<number, number>()

/**
 * Price for an anime, fetched on demand.
 *
 * The original bot never stored a price on claimed cards — `/waifus` recomputed
 * it from the anime's mean score every time it rendered. Cards claimed back then
 * therefore have no `price` field, so we reproduce that lookup instead of writing
 * them all off at the minimum.
 */
export async function priceForAnime(animeId: number | undefined | null): Promise<number> {
    if (!animeId) return MIN_WAIFU_PRICE
    const cached = priceCache.get(animeId)
    if (cached !== undefined) return cached
    const meta = await fetchAnimeMeta(animeId).catch(() => null)
    const price = priceFromMean(meta?.mean)
    // A failed lookup computes the floor price. Caching that would pin every
    // character from this anime to the minimum for the rest of the process life
    // because of one timeout, so only a real answer is remembered.
    if (meta) priceCache.set(animeId, price)
    return price
}

async function fetchAnimeMeta(animeId: number, deadline?: number): Promise<{ mean: number; title: string } | null> {
    const res = await fetch(`${MAL_BASE}/anime/${animeId}?fields=mean,title`, {
        headers: headers(),
        signal: requestSignal(deadline),
    })
    if (!validateResponse(res)) return null
    const data = (await res.json()) as any
    return { mean: data.mean ?? 0, title: decodeHtmlEntities(data.title ?? 'Unknown') }
}

/**
 * MAL returns ONLY `{ node: { id } }` unless every wanted field is named
 * explicitly — and characters have no `name` field at all, just `first_name` /
 * `last_name` / `alternative_name`. Omitting this is why every pulled character
 * came back nameless and imageless. limit=500 pulls the full cast, as the
 * original did — a 100-cap would silently hide most of a big show's characters.
 */
const CHARACTER_FIELDS = 'id,first_name,last_name,alternative_name,main_picture'

async function fetchCharacters(animeId: number, deadline?: number): Promise<any[] | null> {
    const res = await fetch(`${MAL_BASE}/anime/${animeId}/characters?fields=${CHARACTER_FIELDS}&limit=500`, {
        headers: headers(),
        signal: requestSignal(deadline),
    })
    if (!validateResponse(res)) return null
    const data = (await res.json()) as any
    return Array.isArray(data.data) ? data.data : null
}

/** "First Last", falling back to an alternative name — same as the old bot. */
function characterName(node: any): string {
    const full = `${node.first_name || ''}${node.last_name ? ' ' + node.last_name : ''}`.trim()
    return decodeHtmlEntities(full || node.alternative_name || '')
}

/** Fetches all pullable characters for a specific anime id. */
export async function getCharactersForAnime(animeId: number, deadline?: number): Promise<MalCharacter[]> {
    const meta = await fetchAnimeMeta(animeId, deadline)
    if (!meta) return []
    const chars = await fetchCharacters(animeId, deadline)
    if (!chars || chars.length === 0) return []
    const price = priceFromMean(meta.mean)
    return chars
        .map((c: any) => c.node)
        .filter(Boolean)
        .map((node: any) => ({
            id: node.id,
            name: characterName(node),
            image: node.main_picture?.medium ?? node.main_picture?.large ?? null,
            animeId,
            animeName: meta.title,
            price,
        }))
        // The old bot discarded characters missing a name or picture rather than
        // showing a blank card; keep that.
        .filter((c: MalCharacter) => c.name && c.image)
}

/**
 * Picks a random valid anime and returns its characters, skipping / blacklisting
 * broken ids. Returns null if it couldn't find a valid one within the attempts.
 */
export async function getRandomAnimeCharacters(
    maxAttempts = 40,
    deadline = Date.now() + ROLL_BUDGET_MS
): Promise<MalCharacter[] | null> {
    const failed = FailedAnimeIdsService.getInstance()
    await failed.initialize()

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (Date.now() >= deadline) return null
        const animeId = Math.floor(Math.random() * MAX_ANIME_ID) + 1
        if (failed.isFailedId(animeId)) continue
        try {
            const characters = await getCharactersForAnime(animeId, deadline)
            if (characters.length > 0) return characters
            await failed.addFailedId(animeId, 'no characters')
        } catch (error) {
            if (error instanceof MalRequestError && [401, 403, 408, 429].includes(error.status)) {
                // A 429 means we are already being throttled. Retrying instantly
                // against a different id burns the whole roll budget hammering the
                // same throttled endpoint and risks a longer ban, so pause first,
                // but never past the deadline the caller is waiting on.
                if (error.status === 429) {
                    const pause = Math.min(THROTTLE_BACKOFF_MS, Math.max(0, deadline - Date.now()))
                    if (pause <= 0) return null
                    await new Promise((resolve) => {
                        const timer = setTimeout(resolve, pause)
                        timer.unref?.()
                    })
                }
                continue
            }
            // Network and upstream failures are not evidence that the anime id is
            // permanently invalid, so leave it eligible for a later pull.
        }
    }
    return null
}

/**
 * Rolls a character the user doesn't already have.
 *
 * `exclude` holds every character id they own *or* skipped, so a pull can never
 * hand back a duplicate — the same rule the original `selectCharacter` used. An
 * anime whose whole cast is excluded is simply retried elsewhere and is NOT
 * blacklisted: the anime is fine, this user has just exhausted it.
 */
export async function rollCharacter(
    exclude: ReadonlySet<number>,
    maxAttempts = 40
): Promise<MalCharacter | null> {
    const deadline = Date.now() + ROLL_BUDGET_MS
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (Date.now() >= deadline) return null
        const cast = await getRandomAnimeCharacters(1, deadline)
        if (!cast) continue
        const available = cast.filter((c) => !exclude.has(c.id))
        if (available.length) return randomCharacter(available)
    }
    return null
}

/**
 * Rolls another character from the *same* anime, which is what the original skip
 * did before falling back to a fresh random anime.
 */
export async function rollCharacterFromAnime(
    animeId: number,
    exclude: ReadonlySet<number>
): Promise<MalCharacter | null> {
    try {
        const cast = await getCharactersForAnime(animeId)
        const available = cast.filter((c) => !exclude.has(c.id))
        if (available.length) return randomCharacter(available)
    } catch {
        /* fall through to a random anime */
    }
    return null
}

export function randomCharacter(characters: MalCharacter[]): MalCharacter {
    return characters[Math.floor(Math.random() * characters.length)]
}
