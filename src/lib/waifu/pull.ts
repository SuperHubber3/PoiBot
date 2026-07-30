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
import { WAIFU_SKIP_COST } from '../economy/prices.js'
import type { MalCharacter } from '../services/mal.service.js'
import characterStatsSchema from '../models/character-stats-schema.js'
import { checkCooldown } from '../functions/cooldown.js'
import { encodeId } from '../util/component-id.js'
import { v2Container } from '../util/v2.js'

export const WAIFU_PULL_CMD = 'wpull'
export const SKIP_COST = WAIFU_SKIP_COST

/** Hourly allowances, matching the original bot's defaults. */
export const PULL_KEY = 'waifu_pulls'
export const DEFAULT_PULL_LIMIT = 10
export const CLAIM_KEY = 'waifu_claims'
export const DEFAULT_CLAIM_LIMIT = 2

export type PullCtx = Message | ChatInputCommandInteraction | MessageComponentInteraction

export interface WaifuPullSession {
    character: MalCharacter
    /** Who ran /waifu. Protection is measured against *their* claims. */
    initiatorId: string
    /** Set once claimed/sold so a late click can't double-resolve it. */
    resolved?: boolean
    /** Set while a slow action (the skip re-roll) is in flight. */
    busy?: boolean
    /** Summary message to refresh, for multi-rolls. */
    summaryId?: string
    /** Position in a multi-roll, for the summary. */
    index?: number
    /**
     * Owner-granted pull from /force-waifu.
     *
     * Force pulls sit outside the economy: the original consumed no claim to take
     * one and had no protection window, because the whole point is to hand a
     * character to someone regardless of their hourly allowance.
     */
    force?: boolean
    /**
     * Anime the card came from, set for force pulls only. Skips re-roll *within*
     * this anime, as the original's `selectFromAnime` did, rather than wandering
     * off to a random show.
     */
    animeId?: number
}

/**
 * Does the initiator still have claims left?
 *
 * This is the whole protection rule: while they do, the pull is theirs alone;
 * the moment they run out, anyone else *who has claims* can take the character.
 * Checked without incrementing.
 */
export async function initiatorProtected(guildId: string, initiatorId: string): Promise<boolean> {
    const status = await checkCooldown(guildId, initiatorId, CLAIM_KEY, DEFAULT_CLAIM_LIMIT, false)
    return status.allowed
}

/** Total times this character has been claimed across the bot. */
export async function claimCount(characterId: number): Promise<number> {
    const doc = await characterStatsSchema.findOne({ characterId })
    return doc?.claimCount ?? 0
}

export function pullRow(ctx: PullCtx, owner: string, labels: { claim: string; skip: string; sell: string }) {
    return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(encodeId({ cmd: WAIFU_PULL_CMD, owner, action: 'claim' }))
            .setLabel(labels.claim)
            .setEmoji('💖')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(encodeId({ cmd: WAIFU_PULL_CMD, owner, action: 'skip' }))
            .setLabel(labels.skip)
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(encodeId({ cmd: WAIFU_PULL_CMD, owner, action: 'sell' }))
            .setLabel(labels.sell)
            .setStyle(ButtonStyle.Danger)
    )
}

export async function waifuPullActionRow(ctx: PullCtx, owner: string, character: MalCharacter) {
    return pullRow(ctx, owner, {
        claim: await resolveKey(ctx, 'waifu:claimButton'),
        skip: await resolveKey(ctx, 'waifu:skipButton', { cost: SKIP_COST }),
        sell: await resolveKey(ctx, 'waifu:quickSellButton', { price: character.price }),
    })
}

/**
 * The character card.
 *
 * The footer states whether the pull is protected — the original showed this so
 * onlookers knew whether they could take it — and the claim total comes from the
 * shared character-stats collection.
 */
export async function renderWaifuPull(
    ctx: PullCtx,
    character: MalCharacter,
    row?: ActionRowBuilder<MessageActionRowComponentBuilder>,
    note?: string,
    protectedPull?: boolean
) {
    const title = await resolveKey(ctx, 'waifu:pullTitle', {
        name: character.name,
        url: `https://myanimelist.net/character/${character.id}`,
    })
    const details = await resolveKey(ctx, 'waifu:characterDetails', {
        anime: character.animeName,
        animeUrl: `https://myanimelist.net/anime/${character.animeId}`,
        price: character.price,
        claims: await claimCount(character.id),
    })
    const footer =
        protectedPull === undefined
            ? ''
            : await resolveKey(ctx, protectedPull ? 'waifu:pullProtected' : 'waifu:pullUnprotected')

    return v2Container([`## ${title}`, details, note ?? '', footer].filter(Boolean), {
        image: character.image,
        rows: row ? [row] : [],
    })
}
