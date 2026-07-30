import mongoose from 'mongoose'

const characterSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        star: { type: Number, required: true },
        status: { type: String, enum: ['standart', 'premium', 'limited'], required: true },
        constellation: { type: Number, default: 0 },
    },
    { _id: false }
)

const gachaSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    game: { type: String, enum: ['genshin', 'bluearchive'], required: true },
    characters: { type: [characterSchema], default: [] },
})

gachaSchema.index({ guildId: 1, userId: 1, game: 1 }, { unique: true })

const name = 'gacha-inventories'

export default mongoose.models[name] || mongoose.model(name, gachaSchema)
