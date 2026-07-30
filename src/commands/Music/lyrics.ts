import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    Message,
    MessageActionRowComponentBuilder,
    MessageComponentInteraction,
} from 'discord.js'
import { getQueue } from '../../lib/music/queue.js'
import { awaitNode, hasNode, idealNode } from '../../lib/services/lavalink.service.js'
import { encodeId } from '../../lib/util/component-id.js'
import { MusicCtx, guildIdOf } from '../../lib/util/music-ctx.js'
import { sessions } from '../../lib/util/session-store.js'
import { v2, v2Container, v2Payload } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

export const LYRICS_CMD = 'lyr'

export interface LyricsSession {
    chunks: string[]
    heading: string
    artworkUrl?: string
}

interface LyricsResponse {
    sourceName?: string
    provider?: string
    text?: string
    lines?: Array<{ timestamp: number; duration: number; line: string }>
    plugin?: unknown
}

type LyricsCtx = MusicCtx | MessageComponentInteraction

function splitLyrics(text: string, maxLength = 3500): string[] {
    const chunks: string[] = []
    let remaining = text.trim()

    while (remaining.length > maxLength) {
        let splitAt = remaining.lastIndexOf('\n', maxLength)
        if (splitAt < 1) splitAt = maxLength
        chunks.push(remaining.slice(0, splitAt).trimEnd())
        remaining = remaining.slice(splitAt).trimStart()
    }

    if (remaining) chunks.push(remaining)
    return chunks
}

function lyricsButtons(owner: string, page: number, total: number) {
    return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(encodeId({ cmd: LYRICS_CMD, owner, action: 'page', arg: String(Math.max(0, page - 1)) }))
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(encodeId({ cmd: LYRICS_CMD, owner, action: 'page', arg: String(Math.min(total - 1, page + 1)) }))
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === total - 1)
    )
}

export async function renderLyricsPage(ctx: LyricsCtx, owner: string, session: LyricsSession, page: number) {
    const bounded = Math.min(Math.max(0, page), session.chunks.length - 1)
    const blocks = [session.heading, session.chunks[bounded]]
    const rows = session.chunks.length > 1 ? [lyricsButtons(owner, bounded, session.chunks.length)] : []

    if (session.chunks.length > 1) {
        blocks.push(await resolveKey(ctx, 'common:lyricsPage', { page: bounded + 1, total: session.chunks.length }))
    }

    return v2Container(blocks, { thumbnail: session.artworkUrl, rows })
}

function lavalinkBaseUrl(): string {
    const secure = process.env.LAVALINK_SECURE === 'true'
    const host = (process.env.LAVALINK_URL ?? 'localhost:2333')
        .replace(/^https?:\/\//i, '')
        .replace(/\/+$/, '')
    return `${secure ? 'https' : 'http'}://${host}`
}

/**
 * Fetches lyrics for the guild's currently playing track.
 *
 * The LavaLyrics plugin only exposes a player-scoped endpoint — there is no
 * free-text search route — so lyrics are always for whatever is playing now:
 *   GET /v4/sessions/{sessionId}/players/{guildId}/track/lyrics
 */
async function fetchCurrentLyrics(guildId: string): Promise<LyricsResponse | null> {
    const node: any = idealNode()
    const sessionId = node?.sessionId
    if (!node || !sessionId) return null

    const url = new URL(
        `/v4/sessions/${sessionId}/players/${guildId}/track/lyrics`,
        lavalinkBaseUrl()
    )
    url.searchParams.set('skipTrackSource', 'false')

    try {
        const password = process.env.LAVALINK_PASSWORD
        if (!password) return null
        const response = await fetch(url, {
            headers: { Authorization: password },
            signal: AbortSignal.timeout(8_000),
        })
        if (!response.ok) return null
        const body = (await response.json()) as LyricsResponse | LyricsResponse[]
        return Array.isArray(body) ? body[0] ?? null : body
    } catch {
        return null
    }
}

@ApplyOptions<Command.Options>({
    name: 'lyrics',
    aliases: ['ly'],
    description: 'Show lyrics for the song that is currently playing',
    runIn: 'GUILD_ANY',
})
export class LyricsCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder).setName('lyrics').setDescription('Show lyrics for the song that is currently playing')
        )
    }

    public override async messageRun(message: Message) {
        await this.showLyrics(message)
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply()
        await this.showLyrics(interaction, true)
    }

    private async showLyrics(ctx: MusicCtx, deferred = false) {
        const respond = async (key: string) => {
            const payload = v2(await resolveKey(ctx, key))
            if (deferred && ctx instanceof ChatInputCommandInteraction) return ctx.editReply(payload)
            return ctx.reply(payload)
        }

        if (!(await awaitNode()) || !idealNode()) return respond('common:lyricsNodeOffline')

        const current = getQueue(guildIdOf(ctx))?.current?.track.info
        // LavaLyrics is player-scoped: it can only return lyrics for the track
        // currently playing, so a free-text query has nothing to search against.
        if (!current) return respond('common:lyricsNothingPlaying')

        try {
            const result = await fetchCurrentLyrics(guildIdOf(ctx))
            const text = result?.text?.trim() || result?.lines?.map(({ line }) => line).join('\n').trim()
            if (!text) return respond('common:lyricsNotFound')

            const chunks = splitLyrics(text)
            if (!chunks.length) return respond('common:lyricsNotFound')

            const title = current.title.slice(0, 500)
            const heading = `## ${await resolveKey(ctx, 'common:lyricsTitle', { title })}`
            const session: LyricsSession = {
                chunks,
                heading,
                artworkUrl: current.artworkUrl ?? undefined,
            }
            const owner = ctx instanceof Message ? ctx.author.id : ctx.user.id
            const container = await renderLyricsPage(ctx, owner, session, 0)
            const payload = v2Payload(container)
            const message =
                deferred && ctx instanceof ChatInputCommandInteraction
                    ? await ctx.editReply(payload)
                    : await ctx.reply(payload)

            if (chunks.length > 1) await sessions.create<LyricsSession>(message.id, session)
        } catch (error) {
            this.container.logger.error('[music] /lyrics failed:', error)
            return respond(hasNode() ? 'common:lyricsNotFound' : 'common:lyricsNodeOffline')
        }
    }
}
