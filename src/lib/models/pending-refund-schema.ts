import mongoose from 'mongoose'

/**
 * Silver held temporarily and owed back to a user.
 *
 * The `/redeem` troll takes someone's whole balance and returns it 30 seconds
 * later. The original did that with a bare `setTimeout`, so a restart inside that
 * window destroyed the balance for good. Recording the debt makes the refund
 * survive one: `redeemRefunds` sweeps overdue rows on startup.
 */
const pendingRefundSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    amount: { type: Number, required: true },
    dueAt: { type: Date, required: true },
    funded: { type: Boolean, default: false },
    settling: { type: Boolean, default: false },
})

pendingRefundSchema.index({ dueAt: 1 })

const name = 'pending-refunds'

export default mongoose.models[name] || mongoose.model(name, pendingRefundSchema)
