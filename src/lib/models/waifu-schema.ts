import mongoose from 'mongoose'

const reqStr = { type: String, required: true }

// Claimed characters: [{ id, name, img, animeId, animeName, price, claimedAt }]
const waifuSchema = new mongoose.Schema({
    guildId: reqStr,
    userId: reqStr,
    waifus: [Object],
})

waifuSchema.index({ guildId: 1, userId: 1 }, { unique: true })

const name = 'waifus'

export default mongoose.models[name] || mongoose.model(name, waifuSchema)
