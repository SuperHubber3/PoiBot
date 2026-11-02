import waifuSchema from '../models/waifu-schema.js'
import characterStatsSchema from '../models/character-stats-schema.js'
import { MIN_WAIFU_PRICE, priceForAnime, type MalCharacter } from '../services/mal.service.js'
import { container } from '@sapphire/framework'
import { randomUUID } from 'node:crypto'

export interface OwnedWaifu {
    uid: string
    /** Stable source-operation key used to make claims/skips retry-safe. */
    claimKey?: string
    id: number
    name: string
    img: string | null
    animeId: number
    animeName: string
    price: number
    claimedAt: number
    /**
     * Skipped, not owned. Stored in the same array so the character is excluded
     * from future pulls, but hidden from the collection, /sell and /trade.
     */
    blacklisted?: boolean
}

/** Is this card's stored price usable as-is? */
function storedPrice(waifu: Partial<OwnedWaifu> | undefined | null): number | null {
    const price = Number(waifu?.price)
    return Number.isFinite(price) && price > 0 ? price : null
}

/**
 * Sell value of a claimed character, synchronously.
 *
 * `waifus` is a schemaless `[Object]` array, so it still holds cards claimed by
 * the old bot — which never wrote a `price` (that bot recomputed it from the
 * anime's mean score on every render). Reading `.price` off those yields
 * `undefined`, and summing it produced the NaN mongoose tried to cast into
 * `silver`. Prefer `resolveWaifuPrices`, which recovers the real value.
 */
export function waifuPrice(waifu: Partial<OwnedWaifu> | undefined | null): number {
    return storedPrice(waifu) ?? MIN_WAIFU_PRICE
}

/**
 * Fills in prices for cards that predate the stored `price` field by asking MAL
 * for the anime's mean score — the same formula the old bot used — and writes the
 * result back so each card is only ever recomputed once.
 */
export async function resolveWaifuPrices(
    guildId: string,
    userId: string,
    waifus: OwnedWaifu[],
    /**
     * Set false when the cards are no longer in the stored array (the sell path
     * resolves prices on entries it just `$pull`ed). The backfill could never
     * match them, so it is pure cost: an extra findOne plus a wasted save.
     */
    backfill = true
): Promise<OwnedWaifu[]> {
    if (waifus.every((w) => storedPrice(w) !== null)) return waifus

    const missingAnimeIds = [...new Set(
        waifus.filter((w) => storedPrice(w) === null).map((w) => w.animeId)
    )]
    const prices = new Map(
        await Promise.all(
            missingAnimeIds.map(async (animeId) => [animeId, (await priceForAnime(animeId)) || MIN_WAIFU_PRICE] as const)
        )
    )
    const resolved = waifus.map((w) =>
        storedPrice(w) !== null ? w : { ...w, price: prices.get(w.animeId) ?? MIN_WAIFU_PRICE }
    )

    // Backfill so the lookup happens once per card rather than once per render.
    // NOTE: `waifus` may be a *filtered* view (blacklisted entries removed), so the
    // write has to merge by id into the stored array — writing `resolved` wholesale
    // would silently delete every skipped character.
    if (!backfill) return resolved

    // Update only the price field. Replacing the array can resurrect a card sold
    // while MAL was responding, or erase a concurrently claimed card.
    try {
        for (const original of waifus.filter((entry) => storedPrice(entry) === null)) {
            const identity = original.uid
                ? { 'entry.uid': original.uid }
                : { 'entry.id': original.id, 'entry.claimedAt': original.claimedAt }
            await waifuSchema.updateOne(
                { guildId, userId },
                { $set: { 'waifus.$[entry].price': prices.get(original.animeId) ?? MIN_WAIFU_PRICE } },
                { arrayFilters: [{
                    ...identity,
                    'entry.price': original.price === undefined ? { $exists: false } : original.price,
                }] }
            )
        }
    } catch (error) {
        container.logger.warn('[waifu] failed to backfill legacy prices', error)
    }
    return resolved
}

/**
 * The user's collection: everything they actually own.
 *
 * Blacklisted entries (skipped characters) live in the same array but are filtered
 * out here, exactly as the original `/waifus` and `/sell` did. Every caller that
 * indexes into this list — the browser, sell, trade — must use this same view, or
 * the indices won't line up.
 */
export async function getWaifus(guildId: string, userId: string): Promise<OwnedWaifu[]> {
    let doc = await waifuSchema.findOne({ guildId, userId })
    const legacy = ((doc?.waifus as Array<Partial<OwnedWaifu>>) ?? []).filter((w) => !w.uid)
    if (legacy.length) {
        for (const waifu of legacy) {
            await waifuSchema.updateOne(
                { guildId, userId },
                { $set: { 'waifus.$[entry].uid': randomUUID() } },
                {
                    arrayFilters: [{
                        'entry.id': waifu.id,
                        'entry.claimedAt': waifu.claimedAt,
                        'entry.uid': { $exists: false },
                    }],
                }
            )
        }
        doc = await waifuSchema.findOne({ guildId, userId })
    }
    const waifus = ((doc?.waifus as OwnedWaifu[]) ?? []).filter((w) => !w.blacklisted)
    return resolveWaifuPrices(guildId, userId, waifus)
}

/**
 * How many cards the collection view would show.
 *
 * Same filter as `getWaifus` but without the price resolution, which can fan out
 * into MAL lookups and a backfill write. The jump modals only need a page count,
 * and they have to open inside the interaction's 3-second window.
 */
export async function countWaifus(guildId: string, userId: string): Promise<number> {
    const doc = await waifuSchema.findOne({ guildId, userId }).select('waifus.blacklisted').lean()
    return ((doc?.waifus as Array<{ blacklisted?: boolean }>) ?? []).filter((w) => !w.blacklisted).length
}

/**
 * Every character id this user has seen — owned *and* skipped.
 *
 * This is what stops a pull handing back a duplicate, and it's why skips are
 * stored rather than discarded.
 */
export async function getSeenCharacterIds(guildId: string, userId: string): Promise<Set<number>> {
    const doc = await waifuSchema.findOne({ guildId, userId })
    return new Set(((doc?.waifus as OwnedWaifu[]) ?? []).map((w) => w.id))
}

/**
 * Records a skipped character so it never comes up again for this user, without
 * it counting as part of their collection.
 */
export async function blacklistWaifu(
    guildId: string,
    userId: string,
    character: MalCharacter,
    claimKey: string
): Promise<void> {
    await pushWaifuOnce(guildId, userId, {
        uid: randomUUID(),
        claimKey,
        id: character.id,
        name: character.name,
        img: character.image,
        animeId: character.animeId,
        animeName: character.animeName,
        price: character.price,
        claimedAt: Date.now(),
        blacklisted: true,
    })
}

export async function addWaifu(
    guildId: string,
    userId: string,
    character: MalCharacter,
    claimKey: string
): Promise<void> {
    const owned: OwnedWaifu = {
        uid: randomUUID(),
        claimKey,
        id: character.id,
        name: character.name,
        img: character.image,
        animeId: character.animeId,
        animeName: character.animeName,
        price: character.price,
        claimedAt: Date.now(),
    }
    await pushWaifuOnce(guildId, userId, owned)

    // Statistics are secondary to the authoritative collection grant. Their own
    // operation key prevents retries from incrementing twice, and a stats outage
    // must not make the already-granted card look unclaimed to the button handler.
    try {
        const filter = { characterId: character.id, claimKeys: { $ne: claimKey } }
        const update = {
            $setOnInsert: { characterId: character.id },
            $inc: { claimCount: 1 },
            $set: {
                animeId: character.animeId,
                animeName: character.animeName,
            },
            $addToSet: { claimKeys: claimKey },
        }
        try {
            await characterStatsSchema.updateOne(filter, update, { upsert: true })
        } catch (error: any) {
            if (error?.code !== 11000) throw error
            await characterStatsSchema.updateOne(filter, update)
        }
    } catch (error) {
        container.logger.warn('[waifu] failed to update character claim statistics', error)
    }
}

/**
 * Adds one collection entry for a stable source operation. The retry after a
 * duplicate-key race covers two concurrent first writes for the same owner.
 */
async function pushWaifuOnce(
    guildId: string,
    userId: string,
    waifu: OwnedWaifu
): Promise<void> {
    if (!waifu.claimKey) throw new Error('A waifu operation requires a claim key')
    const filter = {
        guildId,
        userId,
        'waifus.claimKey': { $ne: waifu.claimKey },
    }
    const update = {
        $setOnInsert: { guildId, userId },
        $push: { waifus: waifu },
    }
    try {
        await waifuSchema.updateOne(filter, update, { upsert: true })
    } catch (error: any) {
        if (error?.code !== 11000) throw error
        await waifuSchema.updateOne(filter, { $push: { waifus: waifu } })
    }
}

/**
 * Removes cards by their position in the **collection view** (blacklisted entries
 * excluded), which is the numbering every UI shows. Skipped entries are preserved
 * so the characters stay out of future pulls.
 */
export async function removeWaifusByUid(guildId: string, userId: string, uids: string[]): Promise<OwnedWaifu[]> {
    const unique = [...new Set(uids)]
    if (!unique.length) return []
    const doc = await waifuSchema.findOneAndUpdate(
        {
            guildId,
            userId,
            waifus: {
                $all: unique.map((uid) => ({ $elemMatch: { uid, blacklisted: { $ne: true } } })),
            },
        },
        { $pull: { waifus: { uid: { $in: unique }, blacklisted: { $ne: true } } } },
        { new: false }
    )
    if (!doc) return []
    const removed = ((doc.waifus as OwnedWaifu[]) ?? []).filter(
        (waifu) => !waifu.blacklisted && unique.includes(waifu.uid)
    )
    // These entries are already pulled out of the stored array, so there is
    // nothing left for the backfill to write to.
    return resolveWaifuPrices(guildId, userId, removed, false)
}

/**
 * Puts cards back after a sell whose payout failed.
 *
 * Each uid is pushed on its own and only when it isn't already there: a write can
 * land before the driver reports a failure, so a retried restore would otherwise
 * duplicate the card. Same guard `giveCard` uses in the trade path.
 */
export async function restoreWaifus(guildId: string, userId: string, waifus: OwnedWaifu[]): Promise<void> {
    if (!waifus.length) return
    for (const waifu of waifus) {
        await waifuSchema.findOneAndUpdate(
            { guildId, userId, 'waifus.uid': { $ne: waifu.uid } },
            { $setOnInsert: { guildId, userId }, $push: { waifus: waifu } },
            { upsert: true }
        ).catch((error: any) => {
            // Row exists and already holds the card, so the filter missed and the
            // upsert hit the unique (guild,user) index. Nothing left to restore.
            if (error?.code !== 11000) throw error
            return null
        })
    }
}
