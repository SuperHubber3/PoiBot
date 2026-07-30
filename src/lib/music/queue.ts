import { container } from '@sapphire/framework'
import type { Player, Track } from 'shoukaku'
import type { SendableChannels } from 'discord.js'
import { getShoukaku, idealNode } from '../services/lavalink.service.js'
import { applyFilters } from './filters.js'
import { removePanel, schedulePanelRemoval, updatePanel } from './panel.js'

/**
 * Finds a track related to `seed` for autoplay, using YouTube's "Mix" radio
 * playlist (list=RD<videoId>) — the same mechanism the YouTube app uses to keep
 * playing similar music. Tracks already heard this session are skipped.
 */
async function findRelatedTrack(seed: Track, history: Set<string>): Promise<Track | null> {
    const node = idealNode()
    const identifier = (seed.info as any)?.identifier
    if (!node || !identifier) return null

    try {
        const result: any = await node.rest.resolve(
            `https://www.youtube.com/watch?v=${identifier}&list=RD${identifier}`
        )
        const tracks: Track[] =
            result?.loadType === 'playlist' ? result.data?.tracks ?? [] : []
        const candidates = tracks.filter((t) => {
            const id = (t.info as any)?.identifier
            return id && id !== identifier && !history.has(id)
        })
        if (!candidates.length) return null
        return candidates[Math.floor(Math.random() * Math.min(candidates.length, 5))]
    } catch {
        return null
    }
}

/**
 * Per-guild playback queue. Shoukaku is a thin Lavalink wrapper with no queue of
 * its own, so track ordering, repeat modes and auto-advance live here.
 */

export type RepeatMode = 'off' | 'track' | 'queue'

export interface QueuedTrack {
    track: Track
    requesterId: string
}

const queues = new Map<string, MusicQueue>()
const queueCreations = new Map<string, { channelId: string; promise: Promise<MusicQueue> }>()

export class DifferentVoiceChannelError extends Error {
    public constructor() {
        super('A music queue already exists in another voice channel')
        this.name = 'DifferentVoiceChannelError'
    }
}

/**
 * Last track played per guild, for `/again`.
 *
 * Kept outside MusicQueue on purpose: the queue is destroyed when playback stops,
 * which is exactly when someone wants to replay the song they just heard. Memory
 * only — it is expected to be forgotten on restart.
 */
const lastPlayed = new Map<string, Track>()

/**
 * AutoPlay preference per guild.
 *
 * Kept outside MusicQueue for the same reason the filter state is: the queue is
 * destroyed when playback ends, so a setting stored on it could only ever be
 * changed while something was already playing. This lets you arm AutoPlay first
 * and have it apply to the next thing you start.
 */
const autoplayPrefs = new Map<string, boolean>()

export function getAutoplayPref(guildId: string): boolean {
    return autoplayPrefs.get(guildId) ?? false
}

export function setAutoplayPref(guildId: string, on: boolean): void {
    autoplayPrefs.set(guildId, on)
}

export function getLastPlayed(guildId: string): Track | undefined {
    return lastPlayed.get(guildId)
}

export class MusicQueue {
    public readonly guildId: string
    public readonly voiceChannelId: string
    public player: Player
    public textChannel: SendableChannels | null = null
    public tracks: QueuedTrack[] = []
    public current: QueuedTrack | null = null
    public repeat: RepeatMode = 'off'
    public volume = 100
    /**
     * When on, related tracks are queued automatically once the queue runs dry.
     * Reads and writes the guild preference, so it survives this queue's lifetime.
     */
    public get autoplay(): boolean {
        return getAutoplayPref(this.guildId)
    }
    public set autoplay(on: boolean) {
        setAutoplayPref(this.guildId, on)
    }
    /** Name of the voice channel, shown on the Now Playing panel. */
    public voiceChannelName: string | null = null
    /** Track ids already played this session, so autoplay doesn't repeat them. */
    public readonly history = new Set<string>()
    /** Set while stop() is tearing down, so the end event doesn't auto-advance. */
    private destroyed = false
    /** Set while an intentional skip stops the current track. */
    private skipping = false

    public constructor(guildId: string, voiceChannelId: string, player: Player) {
        this.guildId = guildId
        this.voiceChannelId = voiceChannelId
        this.player = player
        this.bind()
    }

    private bind() {
        this.player.on('end', async (data: any) => {
            // "replaced" fires when we deliberately swap tracks; don't double-advance.
            if (this.destroyed || data?.reason === 'replaced') return
            const skipped = this.skipping
            this.skipping = false
            await this.advance(skipped)
        })
        // Lavalink always follows an exception with an end event (reason
        // "loadFailed"), so advancing here too would move the queue twice and
        // silently eat the next track. `end` owns progression; this only logs.
        this.player.on('exception', (err: any) => {
            container.logger.warn(`[music:${this.guildId}] track exception`, err?.exception ?? err)
        })
        // A stuck track never ends on its own, so stop it and let the resulting
        // end event advance. Routing through skip() also bypasses track-repeat,
        // which would otherwise put the same stuck track straight back on.
        this.player.on('stuck', () => {
            container.logger.warn(`[music:${this.guildId}] track stuck, skipping`)
            void this.skip().catch(() => {})
        })
        this.player.on('closed', () => void this.destroy())
    }

    public add(track: Track, requesterId: string) {
        this.tracks.push({ track, requesterId })
    }

    public get size() {
        return this.tracks.length
    }

    /** Starts playback if idle. */
    public async start() {
        if (this.current) return
        await this.advance()
    }

    /** Plays the next track according to the repeat mode. */
    public async advance(skipTrackRepeat = false) {
        if (this.destroyed) return

        if (!skipTrackRepeat && this.repeat === 'track' && this.current) {
            await this.play(this.current)
            return
        }
        if (this.repeat === 'queue' && this.current) {
            this.tracks.push(this.current)
        }

        let next = this.tracks.shift()

        // Queue ran dry — pull a related track so playback keeps going.
        if (!next && this.autoplay && this.current) {
            const related = await findRelatedTrack(this.current.track, this.history)
            if (related) next = { track: related, requesterId: this.current.requesterId }
        }

        if (!next) {
            this.current = null
            schedulePanelRemoval(this.guildId)
            return
        }
        await this.play(next)
    }

    private async play(entry: QueuedTrack) {
        this.current = entry
        lastPlayed.set(this.guildId, entry.track)
        const identifier = (entry.track.info as any)?.identifier
        if (identifier) this.history.add(identifier)
        try {
            await this.player.playTrack({ track: { encoded: entry.track.encoded } })
            // Filters can be set while nothing is playing; push them now so they
            // take effect from the first note rather than being discarded.
            await applyFilters(this.guildId, this.player)
            void updatePanel(this)
        } catch (error) {
            container.logger.error(`[music:${this.guildId}] failed to play`, error)
            // Drop the entry before advancing. Under repeat it would otherwise be
            // replayed (track) or pushed back onto the queue (queue), and since it
            // just failed that is an unbounded retry loop rather than a recovery.
            this.current = null
            await this.advance(true)
        }
    }

    public async skip() {
        if (this.skipping) return
        this.skipping = true
        try {
            // The end event consumes this flag and bypasses track-repeat for this
            // intentional skip. stopTrack may resolve before that event arrives.
            await this.player.stopTrack()
        } catch (error) {
            this.skipping = false
            throw error
        }
    }

    public shuffle() {
        for (let i = this.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]]
        }
    }

    /** Stops playback, clears the queue and leaves the voice channel. */
    public async destroy() {
        if (this.destroyed) return
        this.destroyed = true
        this.tracks = []
        this.current = null
        // Filter state deliberately survives teardown: it can be configured while
        // idle and should still be there for the next /play. /filter clear resets it.
        void removePanel(this.guildId)
        queues.delete(this.guildId)
        try {
            await getShoukaku()?.leaveVoiceChannel(this.guildId)
        } catch {
            /* already gone */
        }
    }
}

export function getQueue(guildId: string): MusicQueue | undefined {
    return queues.get(guildId)
}

/** Gets the existing queue, or joins the voice channel and creates one. */
export async function createQueue(
    guildId: string,
    channelId: string,
    shardId: number,
    textChannel: SendableChannels | null
): Promise<MusicQueue> {
    const existing = queues.get(guildId)
    if (existing) {
        if (existing.voiceChannelId !== channelId) throw new DifferentVoiceChannelError()
        return existing
    }
    const pending = queueCreations.get(guildId)
    if (pending) {
        if (pending.channelId !== channelId) throw new DifferentVoiceChannelError()
        return pending.promise
    }

    const shoukaku = getShoukaku()
    if (!shoukaku) throw new Error('Lavalink is not initialised')

    const creation = (async () => {
        const player = await shoukaku.joinVoiceChannel({ guildId, channelId, shardId, deaf: true })
        const queue = new MusicQueue(guildId, channelId, player)
        queue.textChannel = textChannel
        queues.set(guildId, queue)
        return queue
    })()
    queueCreations.set(guildId, { channelId, promise: creation })
    try {
        return await creation
    } finally {
        queueCreations.delete(guildId)
    }
}

export function allQueues(): MusicQueue[] {
    return [...queues.values()]
}
