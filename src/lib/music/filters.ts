import type { Player, FilterOptions, Band } from 'shoukaku'

/**
 * Filter state + **debounced** application.
 *
 * Lavalink applies filters to the live stream without re-encoding from scratch,
 * but firing a payload on every button/command press makes the audio hiccup.
 * So changes are accumulated into one FilterOptions object and flushed once,
 * shortly after the user stops changing things (what FlaviBot does — the effect
 * lands a moment later, but playback never pauses or glitches).
 */

const FLUSH_DELAY_MS = 600

/**
 * The "Instagram file" bug, reproduced.
 *
 * rate: 22050/48000 — HE-AAC's core sample rate against Lavalink's 48 kHz output.
 * lowPass: Lavaplayer's low-pass is a one-pole IIR whose coefficient is
 *   1/smoothing, so a -3 dB corner of f maps to
 *     smoothing = 1 / (1 - exp(-2*pi*f / 48000))
 *   1.309 puts the corner at ~11 kHz — where the missing SBR band starts.
 *   (For scale: smoothing 8 would be ~1 kHz, i.e. wildly over-muffled.)
 */
const INSTAGRAM_RATE = 22050 / 48000
const INSTAGRAM_LOWPASS = 1.309

export type FilterPreset =
    | 'nightcore'
    | 'slowedreverb'
    | 'vaporwave'
    | 'instagram'
    | '8d'
    | 'lofi'
    | 'tremolo'
    | 'vibrato'
    | 'karaoke'
    | 'earrape'

export interface MusicFilterState {
    /** Enabled named presets. */
    presets: Set<FilterPreset>
    /**
     * Tempo from /speed (1 = normal). Time-stretch: keeps the pitch but has to
     * splice the audio, so extreme values sound choppy/grainy.
     */
    speed: number
    /**
     * Playback rate from /rate (1 = normal). Pure resampling — speed and pitch
     * move together like slowing down a record, so it stays perfectly smooth
     * no matter how far you push it.
     */
    rate: number
    /** Bassboost level 0-10 from /bassboost (0 = off). */
    bass: number
    /** Equalizer preset name from /equalizer, or null. */
    eq: string | null
    /** Raw EQ bands for the active eq preset. */
    eqBands: Band[] | null
}

interface Pending {
    timer: NodeJS.Timeout
    player: Player
}

const states = new Map<string, MusicFilterState>()
const pending = new Map<string, Pending>()

export function getFilterState(guildId: string): MusicFilterState {
    let state = states.get(guildId)
    if (!state) {
        state = { presets: new Set(), speed: 1, rate: 1, bass: 0, eq: null, eqBands: null }
        states.set(guildId, state)
    }
    return state
}

export function clearFilterState(guildId: string): void {
    states.delete(guildId)
    const p = pending.get(guildId)
    if (p) {
        clearTimeout(p.timer)
        pending.delete(guildId)
    }
}

/** 15-band equalizer presets (band index 0 = lowest frequency). */
export const EQ_PRESETS: Record<string, number[]> = {
    Flat: new Array(15).fill(0),
    FullBass: [0.6, 0.55, 0.5, 0.35, 0.2, 0.05, -0.05, -0.1, -0.1, -0.1, -0.1, -0.1, -0.1, -0.1, -0.1],
    FullTreble: [-0.25, -0.25, -0.25, -0.15, -0.05, 0.15, 0.3, 0.4, 0.45, 0.45, 0.45, 0.45, 0.45, 0.5, 0.5],
    FullBassTreble: [0.4, 0.35, 0.25, 0.1, -0.05, -0.1, -0.05, 0.1, 0.2, 0.25, 0.3, 0.35, 0.4, 0.4, 0.4],
    Rock: [0.35, 0.3, 0.2, 0.1, 0.05, -0.05, -0.1, -0.05, 0.05, 0.15, 0.2, 0.25, 0.3, 0.3, 0.3],
    Pop: [-0.05, 0.1, 0.2, 0.25, 0.3, 0.25, 0.15, 0.05, -0.05, -0.05, -0.05, -0.05, 0, 0.05, 0.1],
    Dance: [0.4, 0.35, 0.25, 0.1, 0.05, 0, -0.05, -0.05, 0, 0.05, 0.15, 0.25, 0.3, 0.3, 0.25],
    Party: [0.3, 0.3, 0.15, 0.05, 0, 0, 0, 0, 0, 0, 0.05, 0.15, 0.3, 0.3, 0.3],
    Classical: [0.3, 0.3, 0.25, 0.2, 0.1, 0.05, 0, 0, 0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3],
    Soft: [0.1, 0.1, 0.05, 0, -0.05, -0.1, -0.1, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.25],
    Headphones: [0.35, 0.25, 0.1, -0.05, -0.1, -0.05, 0.05, 0.15, 0.25, 0.3, 0.35, 0.35, 0.4, 0.4, 0.45],
}

function bands(gains: number[]): Band[] {
    return gains.map((gain, band) => ({ band, gain }))
}

/** Merges preset + speed + bass + eq state into a single Lavalink filter payload. */
export function buildFilterPayload(state: MusicFilterState): FilterOptions {
    const payload: FilterOptions = {
        // Explicit nulls clear anything previously set.
        timescale: null,
        tremolo: null,
        vibrato: null,
        rotation: null,
        karaoke: null,
        distortion: null,
        lowPass: null,
        equalizer: [],
    }

    // --- timescale ---------------------------------------------------------
    // `speed` time-stretches (pitch preserved) and gets grainy when pushed far.
    // `rate` resamples: speed and pitch shift together, like a record slowing
    // down, and stays artefact-free at any value. Pitch-shifting presets use
    // `rate` for that reason.
    let speed = state.speed
    const pitch = 1
    let rate = state.rate
    if (state.presets.has('nightcore')) rate *= 1.25
    if (state.presets.has('slowedreverb')) rate *= 0.82
    if (state.presets.has('vaporwave')) rate *= 0.8
    // The "Instagram file" effect, measured from real IG downloads (all HE-AAC,
    // 44100 Hz stereo). HE-AAC's core layer sits at half the declared rate and SBR
    // reconstructs the top octave; a pipeline that mishandles SBR plays back at
    // 22050/48000 AND loses the SBR band, so the slowdown is paired with a
    // low-pass below. Verified by ear against the original clips.
    if (state.presets.has('instagram')) rate *= INSTAGRAM_RATE
    if (speed !== 1 || pitch !== 1 || rate !== 1) {
        payload.timescale = { speed, pitch, rate }
    }

    // --- rotation: 8D audio (audio orbits the listener)
    if (state.presets.has('8d')) payload.rotation = { rotationHz: 0.2 }

    if (state.presets.has('tremolo')) payload.tremolo = { frequency: 4, depth: 0.75 }
    if (state.presets.has('vibrato')) payload.vibrato = { frequency: 4, depth: 0.75 }
    if (state.presets.has('karaoke')) {
        payload.karaoke = { level: 1, monoLevel: 1, filterBand: 220, filterWidth: 100 }
    }
    if (state.presets.has('lofi')) payload.lowPass = { smoothing: 20 }
    // The missing SBR band: rolls off around 11 kHz. Much gentler than lofi.
    if (state.presets.has('instagram')) payload.lowPass = { smoothing: INSTAGRAM_LOWPASS }
    if (state.presets.has('earrape')) payload.distortion = { scale: 2.5 }

    // --- equalizer: /equalizer preset merged with /bassboost level
    const gains = state.eqBands
        ? state.eqBands.map((b) => b.gain)
        : new Array(15).fill(0)
    if (state.bass > 0) {
        const boost = state.bass * 0.1
        for (let i = 0; i < 7; i++) gains[i] = Math.min(1, gains[i] + boost)
    }
    if (state.presets.has('lofi')) {
        for (let i = 10; i < 15; i++) gains[i] = Math.max(-0.25, Math.min(1, gains[i] - 0.2))
    }
    payload.equalizer = gains.some((g) => g !== 0) ? bands(gains) : []

    return payload
}

/**
 * Pushes the guild's filter state to a player immediately, no debounce.
 *
 * Used when a track starts, so filters chosen while nothing was playing are
 * already in effect on the first note instead of being silently dropped.
 */
export async function applyFilters(guildId: string, player: Player): Promise<void> {
    // A queued debounce would otherwise re-send stale state a moment later.
    const p = pending.get(guildId)
    if (p) {
        clearTimeout(p.timer)
        pending.delete(guildId)
    }
    if (!states.has(guildId)) return
    try {
        await player.setFilters(buildFilterPayload(getFilterState(guildId)))
    } catch {
        /* node hiccup — state stays, next change retries */
    }
}

/** True when the guild has any non-default filter set. */
export function hasActiveFilters(guildId: string): boolean {
    const state = states.get(guildId)
    return Boolean(state) && describeFilters(state!).length > 0
}

/**
 * Schedules a debounced flush of the guild's filter state to Lavalink.
 * Repeated calls within the window collapse into one payload.
 */
export function scheduleFilterFlush(guildId: string, player: Player | null | undefined): void {
    // Drop any queued flush first, even when there is no player now: the queue
    // may have been torn down since it was scheduled, and firing it later would
    // call setFilters on a disposed player.
    const existing = pending.get(guildId)
    if (existing) {
        clearTimeout(existing.timer)
        pending.delete(guildId)
    }

    // No player yet: the state is still recorded and gets applied on play().
    if (!player) return

    const timer = setTimeout(async () => {
        pending.delete(guildId)
        try {
            const payload = buildFilterPayload(getFilterState(guildId))
            await player.setFilters(payload)
        } catch {
            /* node hiccup — state stays, next change retries */
        }
    }, FLUSH_DELAY_MS)
    timer.unref?.()

    pending.set(guildId, { timer, player })
}

/** Human-readable list of what's currently on. */
export function describeFilters(state: MusicFilterState): string[] {
    const active: string[] = [...state.presets]
    if (state.speed !== 1) active.push(`speed ${state.speed}x`)
    if (state.rate !== 1) active.push(`rate ${state.rate}x`)
    if (state.bass > 0) active.push(`bassboost ${state.bass}`)
    if (state.eq && state.eq !== 'Flat') active.push(`eq ${state.eq}`)
    return active
}
