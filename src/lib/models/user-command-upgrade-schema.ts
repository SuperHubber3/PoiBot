import mongoose from 'mongoose'

const reqStr = { type: String, required: true }

const userCommandUpgradeSchema = new mongoose.Schema(
    {
        guildId: reqStr,
        userId: reqStr,
        commandKey: reqStr,
        upgradeLevel: {
            type: Number,
            default: 0,
            min: 0,
            validate: { validator: Number.isInteger, message: 'upgradeLevel must be a whole number' },
        },
    },
    { timestamps: true }
)

userCommandUpgradeSchema.index({ guildId: 1, userId: 1, commandKey: 1 }, { unique: true })

const name = 'user-command-upgrades'

export default mongoose.models[name] || mongoose.model(name, userCommandUpgradeSchema)
