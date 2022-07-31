import mongoose from 'mongoose'

const reqStr = { type: String, required: true }
const reqInt = { type: Number, default: 0 }

const boopSchema = new mongoose.Schema({
    userId: reqStr,
    count: reqInt,
})

const counterSchema = new mongoose.Schema({
    guildId: reqStr,
    userId: reqStr,
    boops: [boopSchema]
});

const name = 'counters'

export default mongoose.models[name] || mongoose.model(name, counterSchema);
