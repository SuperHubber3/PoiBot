import mongoose from 'mongoose'

const reqStr = { type: String, required: true }

const upgradesSchema = new mongoose.Schema(
    {
        speed: { type: Number, default: 0 },
        multiply: { type: Number, default: 1 },
    },
    { _id: false }
)

// Tycoon idle points. upgrades: { multiply: number, speed: number }
const pointsSchema = new mongoose.Schema({
    guildId: reqStr,
    userId: reqStr,
    points: { type: Number, default: 0 },
    upgrades: { type: upgradesSchema, default: () => ({ speed: 0, multiply: 1 }) },
})

pointsSchema.index({ guildId: 1, userId: 1 }, { unique: true })

const name = 'points'

export default mongoose.models[name] || mongoose.model(name, pointsSchema)
