import mongoose from 'mongoose'

const reqStr = { type: String, required: true }

const codesSchema = new mongoose.Schema({
    guildId: reqStr,
    userId: reqStr,
    // `state` holds the string 'true', not a boolean. That is how the original
    // bot wrote it, and existing rows still read that way.
    codes: [{ name: String, state: String }],
})

// Redeeming relies on this: the conditional upsert in /redeem only reports "code
// already used" because a second insert for the same pair collides here.
codesSchema.index({ guildId: 1, userId: 1 }, { unique: true })

const name = 'codes'

export default mongoose.models[name] || mongoose.model(name, codesSchema)
