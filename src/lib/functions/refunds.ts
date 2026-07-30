import { container } from '@sapphire/framework'
import pendingRefundSchema from '../models/pending-refund-schema.js'
import { addSilverOnce, hasAppliedDebit, spendSilverOnce } from './economy.js'

/** How long the /redeem troll holds someone's silver. */
export const REFUND_DELAY_MS = 1000 * 30

/**
 * Pays a refund back exactly once.
 *
 * The settling flag is the lock. The debt remains durable until the credit
 * succeeds, so a transient database failure can be retried.
 */
async function settle(id: unknown): Promise<void> {
    const doc: any = await pendingRefundSchema.findOneAndUpdate(
        { _id: id, funded: true, settling: { $ne: true } },
        { $set: { settling: true } },
        { new: true }
    )
    if (!doc) return
    try {
        await addSilverOnce(doc.guildId, doc.userId, doc.amount, `refund:${String(doc._id)}`)
        await pendingRefundSchema.deleteOne({ _id: doc._id, settling: true })
    } catch (error) {
        await pendingRefundSchema.updateOne({ _id: doc._id }, { $set: { settling: false } }).catch(() => {})
        throw error
    }
}

const debitKey = (id: unknown) => `refund-debit:${String(id)}`

/** Backoff between in-process settle retries, capped so it stays bounded. */
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000]

function armRefund(id: unknown, dueAt: Date, attempt = 0): void {
    const remaining = Math.max(0, new Date(dueAt).getTime() - Date.now())
    const timer = setTimeout(() => {
        void settle(id).catch((error) => {
            container.logger.error('[refunds] scheduled refund failed', error)
            // settle() leaves the row funded and un-settling, so the debt is still
            // durable — but without re-arming, nothing retries it until the next
            // restart and the user's silver just sits there. Back off and retry.
            const delay = RETRY_DELAYS_MS[attempt]
            if (delay === undefined) {
                container.logger.error(
                    `[refunds] giving up on ${String(id)} in this process; it will be retried on next startup`
                )
                return
            }
            armRefund(id, new Date(Date.now() + delay), attempt + 1)
        })
    }, remaining)
    timer.unref?.()
}

/** Prepares a non-payable refund row. fundRefund activates it after the debit. */
export async function scheduleRefund(guildId: string, userId: string, amount: number): Promise<unknown | null> {
    if (!Number.isFinite(amount) || amount <= 0) return null
    const doc: any = await pendingRefundSchema.create({
        guildId,
        userId,
        amount: Math.trunc(amount),
        dueAt: new Date(Date.now() + REFUND_DELAY_MS),
        funded: false,
    })
    return doc._id
}

/**
 * Applies the matching debit exactly once, then makes the refund payable. If the
 * process stops between those writes, startup detects the durable debit key and
 * completes activation; an untouched prepared row is discarded.
 */
export async function fundRefund(id: unknown): Promise<boolean> {
    const doc: any = await pendingRefundSchema.findById(id)
    if (!doc) return false
    if (doc.funded) {
        armRefund(doc._id, doc.dueAt)
        return true
    }
    const debited = await spendSilverOnce(
        doc.guildId,
        doc.userId,
        doc.amount,
        debitKey(doc._id)
    )
    if (!debited) return false
    await pendingRefundSchema.updateOne(
        { _id: doc._id },
        { $set: { funded: true } }
    )
    armRefund(doc._id, doc.dueAt)
    return true
}

export async function cancelRefund(id: unknown): Promise<void> {
    if (id) {
        await pendingRefundSchema.deleteOne({
            _id: id,
            funded: { $ne: true },
            settling: { $ne: true },
        })
    }
}

/**
 * Startup sweep: pays anything already due, and re-arms timers for the rest.
 * Without this a restart mid-troll would keep the silver forever.
 */
export async function resumePendingRefunds(): Promise<void> {
    // Rows created before the funded/prepared split were only written for
    // balances the old flow intended to return, so preserve them as payable.
    await pendingRefundSchema.updateMany(
        { funded: { $exists: false } },
        { $set: { funded: true } }
    )
    // A process may have stopped after claiming a row but before paying it.
    await pendingRefundSchema.updateMany(
        { funded: true, settling: true },
        { $set: { settling: false } }
    )
    const docs: any[] = await pendingRefundSchema.find({})
    if (!docs.length) return

    for (const doc of docs) {
        if (!doc.funded) {
            const debited = await hasAppliedDebit(
                doc.guildId,
                doc.userId,
                debitKey(doc._id)
            )
            if (!debited) {
                await pendingRefundSchema.deleteOne({ _id: doc._id, funded: { $ne: true } })
                continue
            }
            await pendingRefundSchema.updateOne(
                { _id: doc._id },
                { $set: { funded: true, settling: false } }
            )
        }
        const remaining = new Date(doc.dueAt).getTime() - Date.now()
        if (remaining <= 0) {
            await settle(doc._id)
            continue
        }
        armRefund(doc._id, doc.dueAt)
    }
    container.logger.info(`[refunds] resumed ${docs.length} pending refund(s)`)
}
