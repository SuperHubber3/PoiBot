import type { GachaBanner, GachaCharacter, GachaGame } from './gacha.js'
import { loadGachaCharacters } from './gacha.js'

const BLUE_ARCHIVE_CHARACTERS_URL = 'https://api.ennead.cc/buruaka/character'
const BLUE_ARCHIVE_BANNERS_URL = 'https://api.ennead.cc/buruaka/banner'
const GENSHIN_CHARACTERS_URL =
    'https://genshin-db-api.vercel.app/api/v5/characters?query=names&matchCategories=true&verboseCategories=true'
const REQUEST_TIMEOUT_MS = 15_000
export const GACHA_REFRESH_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000

// Genshin DB has no event-wish feed. Keep this small override aligned with the
// live character banners; the complete character roster still refreshes via API.
const GENSHIN_LIVE_RATE_UPS = new Set(['Columbina', 'Raiden Shogun'])
const GENSHIN_NON_WISH_CHARACTERS = new Set(['Aether', 'Lumine', 'Manekin', 'Manekina'])

interface BlueArchiveApiCharacter {
    name?: unknown
    baseStar?: unknown
}

interface BlueArchiveBanner {
    rateups?: unknown
}

interface BlueArchiveBannerResponse {
    current?: unknown
}

interface GenshinApiCharacter {
    name?: unknown
    rarity?: unknown
}

export interface RosterRefreshResult {
    game: GachaGame
    total: number
    counts: Record<GachaBanner, number>
    rateUps: string[]
    refreshedAt: Date
}

export const blueArchiveCharacters = loadGachaCharacters('blue-archive-characters.json')
export const genshinCharacters = loadGachaCharacters('genshin-characters.json')

const inFlight = new Map<GachaGame, Promise<RosterRefreshResult>>()

async function fetchJson(url: string): Promise<unknown> {
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
    return response.json()
}

function asArray(value: unknown, label: string): unknown[] {
    if (!Array.isArray(value)) throw new Error(`${label} returned an unexpected payload`)
    return value
}

function replaceRoster(target: GachaCharacter[], next: GachaCharacter[]) {
    if (!next.length) throw new Error('Refusing to replace a gacha roster with an empty response')

    const names = new Set<string>()
    for (const character of next) {
        if (names.has(character.name)) throw new Error(`Duplicate gacha character "${character.name}"`)
        names.add(character.name)
    }

    next.sort((a, b) => a.name.localeCompare(b.name))
    target.splice(0, target.length, ...next)
}

function resultFor(game: GachaGame, roster: readonly GachaCharacter[]): RosterRefreshResult {
    const counts: Record<GachaBanner, number> = { standart: 0, premium: 0, limited: 0 }
    for (const character of roster) counts[character.status]++
    return {
        game,
        total: roster.length,
        counts,
        rateUps: roster.filter((character) => character.status === 'limited').map((character) => character.name),
        refreshedAt: new Date(),
    }
}

async function refreshBlueArchive(): Promise<RosterRefreshResult> {
    const [rawCharacters, rawBanners] = await Promise.all([
        fetchJson(BLUE_ARCHIVE_CHARACTERS_URL),
        fetchJson(BLUE_ARCHIVE_BANNERS_URL),
    ])
    const characterPayload =
        typeof rawCharacters === 'object' && rawCharacters !== null && 'data' in rawCharacters
            ? (rawCharacters as { data: unknown }).data
            : rawCharacters
    const characters = asArray(characterPayload, 'Blue Archive character API') as BlueArchiveApiCharacter[]
    const bannerPayload = rawBanners as BlueArchiveBannerResponse
    const currentBanners = asArray(bannerPayload.current, 'Blue Archive banner API') as BlueArchiveBanner[]
    const rateUps = new Set(
        currentBanners.flatMap((banner) =>
            Array.isArray(banner.rateups)
                ? banner.rateups.filter((name): name is string => typeof name === 'string' && name.length > 0)
                : []
        )
    )
    if (!rateUps.size) throw new Error('Blue Archive banner API returned no current rate-up characters')

    const byName = new Map<string, GachaCharacter>()
    for (const character of characters) {
        const name = typeof character.name === 'string' ? character.name.trim() : ''
        const star = Number(character.baseStar)
        if (!name || ![1, 2, 3].includes(star)) {
            throw new Error(`Invalid Blue Archive character "${name || '<unnamed>'}"`)
        }
        const entry: GachaCharacter = {
            name,
            star,
            status: rateUps.has(name) ? 'limited' : star === 3 ? 'premium' : 'standart',
        }
        const existing = byName.get(name)
        if (existing && (existing.star !== entry.star || existing.status !== entry.status)) {
            throw new Error(`Conflicting Blue Archive character records for "${name}"`)
        }
        byName.set(name, entry)
    }
    const next = [...byName.values()]
    const missingRateUps = [...rateUps].filter((name) => !next.some((character) => character.name === name))
    if (missingRateUps.length) {
        throw new Error(`Blue Archive rate-ups missing from character API: ${missingRateUps.join(', ')}`)
    }

    replaceRoster(blueArchiveCharacters, next)
    return resultFor('bluearchive', blueArchiveCharacters)
}

async function refreshGenshin(): Promise<RosterRefreshResult> {
    const rawCharacters = await fetchJson(GENSHIN_CHARACTERS_URL)
    const characters = asArray(rawCharacters, 'Genshin character API') as GenshinApiCharacter[]
    const next = characters
        .map((character): GachaCharacter | null => {
            const name = typeof character.name === 'string' ? character.name.trim() : ''
            const star = Number(character.rarity)
            if (GENSHIN_NON_WISH_CHARACTERS.has(name)) return null
            if (!name || ![4, 5].includes(star)) {
                throw new Error(`Invalid Genshin character "${name || '<unnamed>'}"`)
            }
            return {
                name,
                star,
                status: GENSHIN_LIVE_RATE_UPS.has(name) ? 'limited' : star === 5 ? 'premium' : 'standart',
            }
        })
        .filter((character): character is GachaCharacter => character !== null)

    const missingRateUps = [...GENSHIN_LIVE_RATE_UPS].filter(
        (name) => !next.some((character) => character.name === name)
    )
    if (missingRateUps.length) throw new Error(`Genshin rate-ups missing from character API: ${missingRateUps.join(', ')}`)

    replaceRoster(genshinCharacters, next)
    return resultFor('genshin', genshinCharacters)
}

export function refreshGachaRoster(game: GachaGame): Promise<RosterRefreshResult> {
    const pending = inFlight.get(game)
    if (pending) return pending

    const refresh = (game === 'bluearchive' ? refreshBlueArchive() : refreshGenshin()).finally(() => {
        inFlight.delete(game)
    })
    inFlight.set(game, refresh)
    return refresh
}
