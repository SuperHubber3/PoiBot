import mongoose from 'mongoose'

const reqStr = { type: String, required: true }

const dailyRewardsSchema = new mongoose.Schema(
    {
        guildId: reqStr,
        userId: reqStr,
    },
    { timestamps: true }
)

dailyRewardsSchema.index({ guildId: 1, userId: 1 }, { unique: true })

const name = 'daily-rewards'

export default mongoose.models[name] || mongoose.model(name, dailyRewardsSchema)
