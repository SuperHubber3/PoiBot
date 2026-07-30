import mongoose from 'mongoose'

const marriageSchema = new mongoose.Schema(
    {
        guildId: { type: String, required: true },
        users: {
            type: [{ type: String, required: true }],
            required: true,
            validate: {
                validator: (users: string[]) => users.length === 2 && users[0] !== users[1],
                message: 'A marriage must contain two different users',
            },
        },
    },
    { timestamps: true }
)

// A unique multikey index makes each guild/user membership exclusive while the
// relationship itself remains one atomic document.
marriageSchema.index({ guildId: 1, users: 1 }, { unique: true })

const name = 'marriages'

export default mongoose.models[name] || mongoose.model(name, marriageSchema)
