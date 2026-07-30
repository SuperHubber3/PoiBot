import mongoose from 'mongoose'

const reqStr = { type: String, required: true }
const reqInt = { type: Number, default: 0 }
const regInt = { type: Number, default: 1 }

const profileSchema = new mongoose.Schema({
    guildId: reqStr,
    userId: reqStr,
    silver: reqInt,
    wishes: reqInt,
    level: regInt,
    xp: reqInt,
    bd: Date,
    marry: String,
    insured: { type: Boolean, default: false },
    // Bought with /shop. Unlocks /vipcolor, which grants a personal colour role.
    vip: { type: Boolean, default: false },
    vipColor: String,
    // Idempotency keys for durable credits such as delayed refunds.
    appliedCredits: { type: [String], default: [] },
    // Idempotency keys for durable debits prepared before a process can crash.
    appliedDebits: { type: [String], default: [] },
});

profileSchema.index({ guildId: 1, userId: 1 }, { unique: true })
// addSilverOnce / spendSilverOnce / hasAppliedDebit all filter on these arrays.
// Multikey indexes keep those checks off a collection scan as the ledgers grow.
profileSchema.index({ guildId: 1, userId: 1, appliedCredits: 1 })
profileSchema.index({ guildId: 1, userId: 1, appliedDebits: 1 })

const name = 'profiles'

export default mongoose.models[name] || mongoose.model(name, profileSchema);
