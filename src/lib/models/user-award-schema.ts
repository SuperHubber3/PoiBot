import mongoose from 'mongoose'

const reqStr = { type: String, required: true }

const userAwardSchema = new mongoose.Schema({
    guildId: reqStr,
    userId: reqStr,
    awards: [{ type: mongoose.Schema.Types.ObjectId }]
});

userAwardSchema.index({ guildId: 1, userId: 1 }, { unique: true })

const name = 'user-awards'

export default mongoose.models[name] || mongoose.model(name, userAwardSchema);
