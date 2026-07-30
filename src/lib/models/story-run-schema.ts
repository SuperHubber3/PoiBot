import mongoose from 'mongoose'

const reqStr = { type: String, required: true }

// Tracks the last time a user completed the daily story task.
// Collection name kept as 'monthly' so existing records aren't orphaned.
const storyRunSchema = new mongoose.Schema(
    {
        guildId: reqStr,
        userId: reqStr,
        lastCompleted: Date,
    },
    { timestamps: true, collection: 'monthly' }
)

storyRunSchema.index({ guildId: 1, userId: 1 }, { unique: true })

const name = 'monthly'

export default mongoose.models[name] || mongoose.model(name, storyRunSchema, 'monthly')
