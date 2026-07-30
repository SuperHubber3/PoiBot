import { container } from '@sapphire/framework'
import type { AwardReplyTarget } from '../types.js'
import profileSchema from '../models/profile-schema.js'
import marriageSchema from '../models/marriage-schema.js'
import { LEVEL_UP_REWARD } from '../economy/prices.js'

const getNeededXP = (level: number) => level * level * 100;

export const addXP = async (guildId: string, userId: string, xpToAdd: number, _message: AwardReplyTarget) => {
    const result = await profileSchema.findOneAndUpdate(
        { guildId, userId },
        {
            guildId,
            userId,
            $inc: { xp: xpToAdd },
        },
        { upsert: true, new: true }
    );

    const { xp, level } = result;
    const needed = getNeededXP(level);
    if (xp < needed) return;

    // Level-up is a read-modify-write, so two messages arriving at once could
    // both see "xp >= needed" and each grant a level. The guard below makes the
    // write conditional on the level still being what we read: whoever lands
    // first wins, the loser matches nothing and skips the reward.
    const claimed = await profileSchema.updateOne(
        { guildId, userId, level },
        { $inc: { level: 1, xp: -needed } }
    );

    const didLevelUp = (claimed.modifiedCount ?? (claimed as any).nModified ?? 0) > 0
    if (didLevelUp) await addSilver(guildId, userId, LEVEL_UP_REWARD);
};

export const getXP = async (guildId: string, userId: string) => {
    const result = await profileSchema.findOne({ guildId, userId });

    let xp = 0;
    if (result) {
        xp = result.xp;
    } else {
        await new profileSchema({ guildId, userId, xp }).save();
    }

    return xp;
};

export const addSilver = async (guildId: string, userId: string, silver: number) => {
    // A NaN/Infinity here reaches mongoose as `$inc: { silver: NaN }`, which both
    // throws a CastError and — if it ever got through — would permanently wreck the
    // balance. Refuse it loudly at the door instead of trusting every caller.
    if (!Number.isFinite(silver)) {
        container.logger.warn(`[economy] ignored non-finite addSilver(${guildId}, ${userId}, ${silver})`)
        return getSilver(guildId, userId)
    }
    silver = Math.trunc(silver)

    const result = await profileSchema.findOneAndUpdate(
        { guildId, userId },
        {
            guildId,
            userId,
            $inc: { silver },
        },
        { upsert: true, new: true }
    );

    return result.silver;
};

/** Atomically applies a named credit once, even if its caller is retried after a crash. */
export const addSilverOnce = async (
    guildId: string,
    userId: string,
    silver: number,
    creditKey: string
): Promise<boolean> => {
    if (!Number.isFinite(silver) || !creditKey) return false
    silver = Math.trunc(silver)

    await profileSchema.updateOne(
        { guildId, userId },
        { $setOnInsert: { guildId, userId } },
        { upsert: true }
    )
    const result = await profileSchema.updateOne(
        { guildId, userId, appliedCredits: { $ne: creditKey } },
        {
            $inc: { silver },
            $addToSet: { appliedCredits: creditKey },
        }
    )
    return (result.modifiedCount ?? (result as any).nModified ?? 0) > 0
}

export const marryUsers = async (guildId: string, firstId: string, secondId: string): Promise<boolean> => {
    if (firstId === secondId) return false
    // Preserve compatibility with relationships created by the legacy profile
    // fields while new marriages use one atomic relationship document.
    const legacy = await profileSchema.exists({
        guildId,
        userId: { $in: [firstId, secondId] },
        marry: { $exists: true, $nin: [null, ''] },
    })
    if (legacy) return false

    try {
        await marriageSchema.create({ guildId, users: [firstId, secondId].sort() })
        return true
    } catch (error: any) {
        if (error?.code === 11000) return false
        throw error
    }
}

export const getMarry = async (guildId: string, userId: string): Promise<string | undefined> => {
    const relationship = await marriageSchema.findOne({ guildId, users: userId })
    if (relationship) {
        return (relationship.users as string[]).find((id) => id !== userId)
    }
    const result = await profileSchema.findOne({ guildId, userId });
    return result?.marry || undefined;
};

export const delMarry = async (guildId: string, userId: string) => {
    await marriageSchema.findOneAndDelete({ guildId, users: userId })
    await profileSchema.updateOne({ guildId, userId }, { $unset: { marry: '' } });
};

export const getSilver = async (guildId: string, userId: string) => {
    const result = await profileSchema.findOne({ guildId, userId });

    let silver = 0;
    if (result) {
        // The field is `silver` (see profile-schema); the old code read a
        // non-existent `coins`, so every balance check compared against undefined.
        silver = result.silver ?? 0;
    }

    return silver;
};

/** Atomically spends silver without allowing a stale balance check to go negative. */
export const spendSilver = async (guildId: string, userId: string, amount: number): Promise<number | null> => {
    if (!Number.isFinite(amount) || amount <= 0) return null
    amount = Math.trunc(amount)
    const result = await profileSchema.findOneAndUpdate(
        { guildId, userId, silver: { $gte: amount } },
        { $inc: { silver: -amount } },
        { new: true }
    )
    if (!result) return null
    return result.silver ?? 0
}

/** Atomically applies a named debit once, allowing crash recovery to verify it. */
export const spendSilverOnce = async (
    guildId: string,
    userId: string,
    amount: number,
    debitKey: string
): Promise<boolean> => {
    if (!Number.isFinite(amount) || amount <= 0 || !debitKey) return false
    amount = Math.trunc(amount)
    const result = await profileSchema.findOneAndUpdate(
        {
            guildId,
            userId,
            silver: { $gte: amount },
            appliedDebits: { $ne: debitKey },
        },
        {
            $inc: { silver: -amount },
            $addToSet: { appliedDebits: debitKey },
        },
        { new: true }
    )
    if (result) return true
    return Boolean(await profileSchema.exists({ guildId, userId, appliedDebits: debitKey }))
}

export const hasAppliedDebit = async (
    guildId: string,
    userId: string,
    debitKey: string
): Promise<boolean> =>
    Boolean(await profileSchema.exists({ guildId, userId, appliedDebits: debitKey }))

/** Atomically sets a balance to zero and returns the amount that was removed. */
export const wipeSilver = async (guildId: string, userId: string): Promise<number> => {
    const previous = await profileSchema.findOneAndUpdate(
        { guildId, userId },
        { $set: { silver: 0 } },
        { new: false }
    )
    return previous?.silver ?? 0
}

export const addWishes = async (guildId: string, userId: string, wishes: number) => {
    if (!Number.isFinite(wishes)) {
        container.logger.warn(`[economy] ignored non-finite addWishes(${guildId}, ${userId}, ${wishes})`)
        return getWishes(guildId, userId)
    }
    wishes = Math.trunc(wishes)

    const result = await profileSchema.findOneAndUpdate(
        { guildId, userId },
        { guildId, userId, $inc: { wishes } },
        { upsert: true, new: true }
    )
    return result.wishes ?? 0
}

export const getWishes = async (guildId: string, userId: string): Promise<number> => {
    const result = await profileSchema.findOne({ guildId, userId })
    if (result) return result.wishes ?? 0
    await new profileSchema({ guildId, userId }).save()
    return 0
}

/**
 * Reserves a complete gacha batch in one conditional write. Returning null means
 * the balance changed (or was insufficient), so no partial batch is ever charged.
 */
export const spendWishes = async (guildId: string, userId: string, amount: number): Promise<number | null> => {
    if (!Number.isFinite(amount) || amount <= 0) return null
    amount = Math.trunc(amount)
    const result = await profileSchema.findOneAndUpdate(
        { guildId, userId, wishes: { $gte: amount } },
        { $inc: { wishes: -amount } },
        { new: true }
    )
    return result ? result.wishes ?? 0 : null
}

/**
 * Steal insurance: a one-shot shield against the 1% total-wipe roll.
 * Bought with /insurance and consumed the moment it saves someone.
 */
/**
 * VIP flag on the profile. Lives here rather than beside the shop command so
 * `lib/gacha` can gate the premium banner without a lib -> command import.
 */
export const isVip = async (guildId: string, userId: string): Promise<boolean> => {
    const doc = await profileSchema.findOne({ guildId, userId })
    return Boolean(doc?.vip)
}

export const hasInsurance = async (guildId: string, userId: string): Promise<boolean> => {
    const result = await profileSchema.findOne({ guildId, userId })
    return Boolean(result?.insured)
}

/**
 * Grants insurance, but only to someone who isn't already covered.
 *
 * Conditional on `insured` still being unset, so two /insurance calls racing each
 * other can't both charge for the same one-shot policy: the loser gets `false`
 * back and its caller refunds. Mirrors `consumeInsurance` on the way out.
 */
export const grantInsurance = async (guildId: string, userId: string): Promise<boolean> => {
    try {
        const result = await profileSchema.findOneAndUpdate(
            { guildId, userId, insured: { $ne: true } },
            { $setOnInsert: { guildId, userId }, $set: { insured: true } },
            { upsert: true, new: true }
        )
        return Boolean(result)
    } catch (error: any) {
        // The row exists and is already insured, so the filter missed and the
        // upsert collided with the unique (guild,user) index.
        if (error?.code === 11000) return false
        throw error
    }
}

/**
 * Consumes insurance if present. Returns true when the user was covered, so the
 * caller can skip the penalty. Conditional on `insured: true` so two concurrent
 * claims can't both be protected by one policy.
 */
export const consumeInsurance = async (guildId: string, userId: string): Promise<boolean> => {
    const result = await profileSchema.updateOne(
        { guildId, userId, insured: true },
        { $set: { insured: false } }
    )
    return (result.modifiedCount ?? (result as any).nModified ?? 0) > 0
}
