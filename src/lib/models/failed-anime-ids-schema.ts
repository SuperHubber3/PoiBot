import mongoose from 'mongoose'

const failedAnimeIdsSchema = new mongoose.Schema({
    animeId: { type: Number, required: true, unique: true },
    failureReason: String,
    failureDate: { type: Date, default: Date.now },
    failureCount: { type: Number, default: 1 },
})

const name = 'failed-anime-ids'

export default mongoose.models[name] || mongoose.model(name, failedAnimeIdsSchema)
