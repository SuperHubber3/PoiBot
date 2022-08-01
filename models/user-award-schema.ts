import mongoose from 'mongoose'

const reqStr = { type: String, required: true }
const reqInt = { type: Number, default: 0 }

const userAwardSchema = new mongoose.Schema({
    guildId: reqStr,
    userId: reqStr,
    awards: [{ type: String }]
});

const name = 'user-awards'

export default mongoose.models[name] || mongoose.model(name, userAwardSchema);
