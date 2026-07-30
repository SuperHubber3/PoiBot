import mongoose from 'mongoose'

const characterStatsSchema = new mongoose.Schema({
    animeId: { type: Number, required: true },
    characterId: { type: Number, required: true, unique: true },
    animeName: String,
    claimCount: { type: Number, default: 0 },
    claimKeys: { type: [String], default: [] },
})

const name = 'character-stats'

export default mongoose.models[name] || mongoose.model(name, characterStatsSchema)
