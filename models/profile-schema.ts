import mongoose from 'mongoose'

const reqStr = { type: String, required: true }
const reqInt = { type: Number, default: 0 }
const regInt = { type: Number, default: 1 }

const profileSchema = new mongoose.Schema({
    guildId: reqStr,
    userId: reqStr,
    silver: reqInt,
    level: regInt,
    xp: reqInt,
});

const name = 'profiles'

export default mongoose.models[name] || mongoose.model(name, profileSchema);
