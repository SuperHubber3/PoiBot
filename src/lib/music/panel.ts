import { container } from '@sapphire/framework'
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    Message,
    MessageActionRowComponentBuilder,
    SendableChannels,
} from 'discord.js'
import { encodeId } from '../util/component-id.js'
import { v2Container, v2Payload } from '../util/v2.js'
import type { MusicQueue } from './queue.js'

export const PANEL_CMD = 'mp'

/** How often the progress bar refreshes while a track plays. */
const TICK_MS = 7000
/** Grace period before the panel disappears once playback ends. */
const DELETE_DELAY_MS = 5000

interface PanelState {
    message: Message
    /** Who may use the panel buttons (the requester of the current session). */
    ownerId: string
    ticker: NodeJS.Timeout | null
    deleteTimer: NodeJS.Timeout | null
}

const panels = new Map<string, PanelState>()

function formatTime(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) ms = 0
    const total = Math.floor(ms / 1000)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const mm = h ? String(m).padStart(2, '0') : String(m)
    return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

/** Discord-style scrubber: ▬▬🔘▬▬ */
function progressBar(position: number, duration: number, width = 22): string {
    if (!duration || duration <= 0) return '🔘' + '▬'.repeat(width - 1)
    const ratio = Math.min(1, Math.max(0, position / duration))
    const filled = Math.round(ratio * (width - 1))
    return '▬'.repeat(filled) + '🔘' + '▬'.repeat(width - 1 - filled)
}

function buttons(queue: MusicQueue, ownerId: string) {
    const id = (action: string) => encodeId({ cmd: PANEL_CMD, owner: ownerId, action })
    const paused = queue.player.paused
    return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(id('playpause'))
            .setEmoji(paused ? '▶️' : '⏸️')
            .setLabel(paused ? 'Resume' : 'Pause')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id('skip')).setEmoji('⏭️').setLabel('Skip').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id('stop')).setEmoji('⏹️').setLabel('Stop').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(id('autoplay'))
            .setEmoji('🔄')
            .setLabel('AutoPlay')
            .setStyle(queue.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id('dashboard')).setEmoji('📊').setLabel('Dashboard').setStyle(ButtonStyle.Primary)
    )
}

/** Builds the Now Playing container for the queue's current state. */
export function buildPanel(queue: MusicQueue, ownerId: string): ContainerBuilder {
    const entry = queue.current
    if (!entry) return v2Container('## Now playing\nNothing is playing right now.')

    const info: any = entry.track.info
    const position = queue.player.position ?? 0
    const duration = info.length ?? 0
    const voiceName = queue.voiceChannelName ? `🔊 ${queue.voiceChannelName}` : null

    const lines = [
        '## Now playing',
        `### [${info.title}](${info.uri})`,
        [
            `- Added by <@${entry.requesterId}>`,
            voiceName ? `- ${voiceName}` : null,
        ]
            .filter(Boolean)
            .join('\n'),
        `Queue Size: \`${queue.tracks.length}\` · Volume: \`${queue.volume}%\` · Loop: \`${queue.repeat}\`` +
            (queue.autoplay ? ' · AutoPlay: `on`' : ''),
        info.isStream
            ? '🔴 **LIVE**'
            : `${progressBar(position, duration)}\n\`${formatTime(position)}\` / \`${formatTime(duration)}\``,
    ]

    return v2Container(lines, {
        thumbnail: info.artworkUrl ?? null,
        rows: [buttons(queue, ownerId)],
        color: 0x2ecc71,
    })
}

function clearTimers(state: PanelState) {
    if (state.ticker) clearInterval(state.ticker)
    if (state.deleteTimer) clearTimeout(state.deleteTimer)
    state.ticker = null
    state.deleteTimer = null
}

/**
 * Creates (or refreshes) the panel in the channel the play command was used in.
 * A guild only ever has one panel; re-invoking play reuses it.
 */
export async function showPanel(
    queue: MusicQueue,
    channel: SendableChannels,
    ownerId: string
): Promise<void> {
    const existing = panels.get(queue.guildId)

    // Reuse the existing panel if it is still in the same channel.
    if (existing && existing.message.channelId === channel.id) {
        if (existing.deleteTimer) {
            clearTimeout(existing.deleteTimer)
            existing.deleteTimer = null
        }
        existing.ownerId = ownerId
        await updatePanel(queue)
        startTicker(queue)
        return
    }

    // Moved channels (or first run) — drop the old one.
    if (existing) await removePanel(queue.guildId)

    try {
        const message = await channel.send(v2Payload(buildPanel(queue, ownerId)))
        panels.set(queue.guildId, { message, ownerId, ticker: null, deleteTimer: null })
        startTicker(queue)
    } catch (error) {
        container.logger.warn(`[music:${queue.guildId}] could not post panel`, error)
    }
}

/** Re-renders the panel in place. Safe to call often. */
export async function updatePanel(queue: MusicQueue): Promise<void> {
    const state = panels.get(queue.guildId)
    if (!state) return
    try {
        await state.message.edit({ components: [buildPanel(queue, state.ownerId)] as any })
    } catch {
        // Message was deleted by someone — stop tracking it.
        clearTimers(state)
        panels.delete(queue.guildId)
    }
}

function startTicker(queue: MusicQueue) {
    const state = panels.get(queue.guildId)
    if (!state) return
    if (state.ticker) clearInterval(state.ticker)
    const ticker = setInterval(() => {
        const current = panels.get(queue.guildId)
        if (!current || !queue.current) return
        if (queue.player.paused) return // nothing moves while paused
        void updatePanel(queue)
    }, TICK_MS)
    ticker.unref?.()
    state.ticker = ticker
}

/** Deletes the panel immediately. */
export async function removePanel(guildId: string): Promise<void> {
    const state = panels.get(guildId)
    if (!state) return
    clearTimers(state)
    panels.delete(guildId)
    await state.message.delete().catch(() => {})
}

/**
 * Schedules the panel to disappear shortly after playback ends, so the last
 * track stays visible for a moment instead of vanishing instantly.
 */
export function schedulePanelRemoval(guildId: string): void {
    const state = panels.get(guildId)
    if (!state || state.deleteTimer) return
    if (state.ticker) {
        clearInterval(state.ticker)
        state.ticker = null
    }
    const timer = setTimeout(() => void removePanel(guildId), DELETE_DELAY_MS)
    timer.unref?.()
    state.deleteTimer = timer
}

export function getPanelOwner(guildId: string): string | undefined {
    return panels.get(guildId)?.ownerId
}
