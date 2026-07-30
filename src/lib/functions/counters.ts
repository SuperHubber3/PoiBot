import type { AwardReplyTarget } from '../types.js'
import { CommandType } from '../enums/command.enum.js';
import counterSchema from '../models/command-counter-schema.js'
import profileSchema from '../models/profile-schema.js';
import { AwardSystemService } from '../services/award-system.service.js';
import { container } from '@sapphire/framework'

/**
 * All interaction counters (boop/hug/punch/...) share the same document shape and
 * add/get logic. The only per-type differences are:
 *   - `award`: which award type (if any) to check on every increment
 *   - `cache`: whether reads are served from the in-memory cache
 * so they live in this table instead of 9 copy-pasted function pairs.
 */
type CounterField =
    | 'boops' | 'hugs' | 'punches' | 'gehs'
    | 'slaps' | 'kills' | 'bites' | 'cuddles' | 'pats' | 'kisses'

interface FieldMeta {
    award?: CommandType
    cache: boolean
}

const META: Record<CounterField, FieldMeta> = {
    boops: { award: CommandType.Boop, cache: true },
    hugs: { award: CommandType.Hug, cache: false },
    punches: { award: CommandType.Punch, cache: true },
    gehs: { award: CommandType.Geh, cache: true },
    slaps: { award: CommandType.Slap, cache: true },
    kills: { award: CommandType.Kill, cache: false },
    bites: { award: CommandType.Bite, cache: true },
    cuddles: { award: CommandType.Cuddle, cache: true },
    pats: { award: CommandType.Pat, cache: true },
    kisses: { award: CommandType.Kiss, cache: true },
}

const countCache = {} as { [key: string]: number }
const bdCache = {} as { [key: string]: Date }

const cacheKey = (field: CounterField, guildId: string, userId: string, partnerId: string) =>
    `${field}:${guildId}-${userId}-${partnerId}`

async function addCount(
    field: CounterField,
    guildId: string,
    userId: string,
    partnerId: string,
    message: AwardReplyTarget
): Promise<number> {
    let updated: any = await counterSchema.findOneAndUpdate(
        {
            guildId,
            userId,
            [field]: {
                $elemMatch: {
                    userId: partnerId,
                },
            },
        },
        { $inc: { [`${field}.$[partner].count`]: 1 } },
        {
            new: true,
            arrayFilters: [
                {
                    'partner.userId': partnerId,
                },
            ],
        }
    )

    if (!updated) {
        await counterSchema.updateOne(
            { guildId, userId },
            { $setOnInsert: { guildId, userId } },
            { upsert: true }
        )
        updated = await counterSchema.findOneAndUpdate(
            { guildId, userId, [`${field}.userId`]: { $ne: partnerId } },
            { $push: { [field]: { userId: partnerId, count: 1 } } },
            { new: true }
        )
        // Another increment may have inserted the partner between the two writes.
        if (!updated) {
            updated = await counterSchema.findOneAndUpdate(
                { guildId, userId, [`${field}.userId`]: partnerId },
                { $inc: { [`${field}.$[partner].count`]: 1 } },
                { new: true, arrayFilters: [{ 'partner.userId': partnerId }] }
            )
        }
    }

    const count = Math.max(
        0,
        (updated?.[field] ?? []).find((entry: any) => entry.userId === partnerId)?.count ?? 0
    )

    const meta = META[field];
    if (meta.award) {
        try {
            const result: any[] = await counterSchema.aggregate([
                { $match: { userId, guildId } },
                { $addFields: { totalCount: { $sum: `$${field}.count` } } },
            ])
            const item = result[0];
            if (!isNaN(item?.totalCount)) {
                await new AwardSystemService(meta.award)
                    .checkForAward(guildId, userId, item.totalCount, message)
            }
        } catch (error) {
            container.logger.error('[counters] award processing failed', error)
        }
    }

    if (meta.cache) countCache[cacheKey(field, guildId, userId, partnerId)] = count;
    return count;
}

async function getCount(
    field: CounterField,
    guildId: string,
    userId: string,
    partnerId: string
): Promise<number> {
    const meta = META[field];
    if (meta.cache) {
        const key = cacheKey(field, guildId, userId, partnerId)
        if (Object.hasOwn(countCache, key)) return countCache[key]
    }

    const result = await counterSchema.findOne({ guildId, userId });

    let count = 0;
    if (result) {
        (result[field] || []).forEach((element: { userId: string, count: number }) => {
            if (element.userId === partnerId) count = element.count;
        });
    }

    if (meta.cache) countCache[cacheKey(field, guildId, userId, partnerId)] = count;
    return count;
}

export const addBoop = (guildId: string, userId: string, partnerId: string, message: AwardReplyTarget) =>
    addCount('boops', guildId, userId, partnerId, message);
export const getBoop = (guildId: string, userId: string, partnerId: string) =>
    getCount('boops', guildId, userId, partnerId);

export const addHug = (guildId: string, userId: string, partnerId: string, message: AwardReplyTarget) =>
    addCount('hugs', guildId, userId, partnerId, message);
export const getHug = (guildId: string, userId: string, partnerId: string) =>
    getCount('hugs', guildId, userId, partnerId);

export const addPunch = (guildId: string, userId: string, partnerId: string, message: AwardReplyTarget) =>
    addCount('punches', guildId, userId, partnerId, message);
export const getPunch = (guildId: string, userId: string, partnerId: string) =>
    getCount('punches', guildId, userId, partnerId);

export const addGeh = (guildId: string, userId: string, partnerId: string, message: AwardReplyTarget) =>
    addCount('gehs', guildId, userId, partnerId, message);
export const getGeh = (guildId: string, userId: string, partnerId: string) =>
    getCount('gehs', guildId, userId, partnerId);

export const addSlap = (guildId: string, userId: string, partnerId: string, message: AwardReplyTarget) =>
    addCount('slaps', guildId, userId, partnerId, message);
export const getSlap = (guildId: string, userId: string, partnerId: string) =>
    getCount('slaps', guildId, userId, partnerId);

export const addKill = (guildId: string, userId: string, partnerId: string, message: AwardReplyTarget) =>
    addCount('kills', guildId, userId, partnerId, message);
export const getKill = (guildId: string, userId: string, partnerId: string) =>
    getCount('kills', guildId, userId, partnerId);

export const addBite = (guildId: string, userId: string, partnerId: string, message: AwardReplyTarget) =>
    addCount('bites', guildId, userId, partnerId, message);
export const getBite = (guildId: string, userId: string, partnerId: string) =>
    getCount('bites', guildId, userId, partnerId);

export const addCuddle = (guildId: string, userId: string, partnerId: string, message: AwardReplyTarget) =>
    addCount('cuddles', guildId, userId, partnerId, message);
export const getCuddle = (guildId: string, userId: string, partnerId: string) =>
    getCount('cuddles', guildId, userId, partnerId);

export const addPat = (guildId: string, userId: string, partnerId: string, message: AwardReplyTarget) =>
    addCount('pats', guildId, userId, partnerId, message);
export const getPat = (guildId: string, userId: string, partnerId: string) =>
    getCount('pats', guildId, userId, partnerId);

export const addKiss = (guildId: string, userId: string, partnerId: string, message: AwardReplyTarget) =>
    addCount('kisses', guildId, userId, partnerId, message);
export const getKiss = (guildId: string, userId: string, partnerId: string) =>
    getCount('kisses', guildId, userId, partnerId);

export const setBd = async (guildId: string, userId: string, date: Date) => {
    const result = await profileSchema.findOneAndUpdate(
        { guildId, userId },
        { guildId, userId, bd: date },
        { upsert: true, new: true }
    );

    bdCache[`${guildId}-${userId}`] = date;
    return result;
};

export const getBd = async (guildId: string, userId: string): Promise<Date | undefined> => {
    const cachedValue = bdCache[`${guildId}-${userId}`];
    if (cachedValue) return cachedValue;

    const result = await profileSchema.findOne({ guildId, userId });

    let date: Date | undefined = undefined;
    if (result) date = result.bd;

    if (date) bdCache[`${guildId}-${userId}`] = date;
    return date;
};
