import mongoose from 'mongoose'

const reqStr = { type: String, required: true }

// Hourly usage-limit tracking for commands with upgradable limits (waifu pulls/claims, fish).
const cooldownSchema = new mongoose.Schema({
    guildId: reqStr,
    userId: reqStr,
    command: reqStr,
    lastReset: { type: Date, default: Date.now },
    count: { type: Number, default: 0 },
})

cooldownSchema.index({ guildId: 1, userId: 1, command: 1 }, { unique: true })

const name = 'cooldown-v2'

export default mongoose.models[name] || mongoose.model(name, cooldownSchema)
