import { resolveKey } from '@sapphire/plugin-i18next'
import {
    ChatInputCommandInteraction,
    GuildMember,
    Message,
    VoiceBasedChannel,
} from 'discord.js'
import type { MusicQueue } from '../music/queue.js'

export type MusicCtx = Message | ChatInputCommandInteraction

/** The invoking member's current voice channel, or null. */
export function voiceChannelOf(ctx: MusicCtx): VoiceBasedChannel | null {
    const member = ctx.member as GuildMember | null
    return member?.voice?.channel ?? null
}

export function guildIdOf(ctx: MusicCtx): string {
    return ctx.guild!.id
}

/** Whether the invoker is listening in the queue's connected voice channel. */
export function canControlQueue(ctx: MusicCtx, queue: MusicQueue): boolean {
    return voiceChannelOf(ctx)?.id === queue.voiceChannelId
}

/** Unified reply for both message and interaction contexts. */
export async function replyTo(ctx: MusicCtx, content: string) {
    if (ctx instanceof Message) return ctx.reply({ content, allowedMentions: { parse: [] } })
    return ctx.reply({ content })
}

export async function replyKey(ctx: MusicCtx, key: string, vars?: Record<string, unknown>) {
    return replyTo(ctx, await resolveKey(ctx, key, vars))
}
