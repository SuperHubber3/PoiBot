import CooldownModel from '../models/cooldown-schema.js'
import UserCommandUpgradeModel from '../models/user-command-upgrade-schema.js'

export interface CooldownResult {
    allowed: boolean
    currentCount?: number
    limit?: number
}

/** Start of the current clock hour — the usage window. */
function windowStart(): Date {
    return new Date(new Date().setMinutes(0, 0, 0))
}

/** Base limit plus whatever the user has bought with /upgrade. */
async function effectiveLimit(guildId: string, userId: string, command: string, max: number): Promise<number> {
    const upgrade = await UserCommandUpgradeModel.findOne({ guildId, userId, commandKey: command })
    const level = upgrade?.upgradeLevel
    return typeof level === 'number' && level > 0 ? max + level : max
}

/**
 * Hourly usage-limit check for commands with upgradable limits (waifu pulls and
 * claims, fish). The window is the current clock hour; `max` is raised by the
 * user's upgrade level for the command key, if any.
 *
 * Consuming a use is **atomic**. It used to read the document, compare, mutate
 * and save — four steps with three gaps — so two claims arriving together both
 * saw `count < limit` and both went through, handing out a use nothing paid for.
 * Each branch below is a single conditional write instead, and the loop re-runs
 * when a concurrent caller wins a race, so the limit holds however fast the
 * buttons are pressed.
 *
 * @param shouldIncrement if false, only checks without consuming a use.
 */
export async function checkCooldown(
    guildId: string,
    userId: string,
    command: string,
    max: number,
    shouldIncrement: boolean = true
): Promise<CooldownResult> {
    const hourStart = windowStart()
    const limit = await effectiveLimit(guildId, userId, command, max)
    const key = { guildId, userId, command }

    // Advisory check — no write, so nothing to race against. A record left over
    // from an earlier hour counts as zero rather than being reset here; the
    // consuming path below does that when a use is actually taken.
    if (!shouldIncrement) {
        const record = await CooldownModel.findOne(key)
        const count = record && record.lastReset >= hourStart ? record.count : 0
        return { allowed: count < limit, currentCount: count, limit }
    }

    // Three attempts is plenty: each pass either succeeds, proves the limit is
    // reached, or loses one race to a concurrent caller — who has then created
    // the document that the next pass needs.
    for (let attempt = 0; attempt < 3; attempt++) {
        // Already counting this hour and still under the limit.
        const bumped = await CooldownModel.findOneAndUpdate(
            { ...key, lastReset: { $gte: hourStart }, count: { $lt: limit } },
            { $inc: { count: 1 } },
            { new: true }
        )
        if (bumped) return { allowed: true, currentCount: bumped.count, limit }

        // Left over from an earlier hour: open a fresh window holding this use.
        const rolled = await CooldownModel.findOneAndUpdate(
            { ...key, lastReset: { $lt: hourStart } },
            { $set: { lastReset: hourStart, count: 1 } },
            { new: true }
        )
        if (rolled) return { allowed: true, currentCount: rolled.count, limit }

        // Nothing recorded yet. `$setOnInsert` means only the caller that actually
        // creates the document gets the use; the loser retries and takes the
        // increment branch instead.
        try {
            const created = await CooldownModel.updateOne(
                key,
                { $setOnInsert: { ...key, lastReset: hourStart, count: 1 } },
                { upsert: true }
            )
            if (created.upsertedCount) return { allowed: true, currentCount: 1, limit }
        } catch (error: any) {
            // Two upserts hitting the unique index at once — retry, don't fail.
            if (error?.code !== 11000) throw error
        }

        // Nothing applied: either we are genuinely at the limit, or someone beat
        // us to the document. Only the former should stop us.
        const record = await CooldownModel.findOne(key)
        if (record && record.lastReset >= hourStart && record.count >= limit) {
            return { allowed: false, currentCount: record.count, limit }
        }
    }

    const record = await CooldownModel.findOne(key)
    return { allowed: false, currentCount: record?.count ?? limit, limit }
}

/** Returns one use to the active hourly window after work fails before producing a result. */
export async function refundCooldownUse(
    guildId: string,
    userId: string,
    command: string
): Promise<boolean> {
    const result = await CooldownModel.updateOne(
        {
            guildId,
            userId,
            command,
            lastReset: { $gte: windowStart() },
            count: { $gt: 0 },
        },
        { $inc: { count: -1 } }
    )
    return (result.modifiedCount ?? (result as any).nModified ?? 0) > 0
}
