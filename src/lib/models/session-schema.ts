import mongoose from 'mongoose'

// Persistent backend for the session store (opt-in via persist:true). The
// `expiresAt` TTL index lets MongoDB auto-remove stale interaction sessions.
const sessionSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    data: { type: mongoose.Schema.Types.Mixed },
    expiresAt: { type: Date, required: true },
})

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const name = 'sessions'

export default mongoose.models[name] || mongoose.model(name, sessionSchema)
