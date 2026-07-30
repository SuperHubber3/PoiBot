import mongoose from 'mongoose'

const guildSettingsSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    language: { type: String, enum: ['en-US', 'tr-TR'], default: 'en-US' },
    welcomeChannelId: String,
    welcomeMessage: String,
})

const name = 'guild-settings'

export default mongoose.models[name] || mongoose.model(name, guildSettingsSchema)
